const CF_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_SCRIPT_URL = "https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj";
const PROXY_LIST_URL = "https://r2.lifetime69.workers.dev/raw/bj3yy7362a9mkfcjltj";

// ==================== UTILITY FUNCTIONS ====================

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function sanitizeWorkerName(name) {
  if (!name) return `worker-${Date.now().toString(36)}`;
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

// ==================== CLOUDFLARE API CLIENT ====================

class CfClient {
  constructor(email, apiKey) {
    this.email = email;
    this.apiKey = apiKey;
  }

  async _fetch(path, options = {}) {
    const url = `${CF_BASE_URL}${path}`;
    const headers = {
      "X-Auth-Email": this.email,
      "X-Auth-Key": this.apiKey,
      "Content-Type": options.contentType || "application/json",
      "User-Agent": "Cloudflare-Worker-Manager/1.0"
    };

    if (options.contentType === null) delete headers["Content-Type"];

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.errors?.[0]?.message || `CF API Error: ${response.status}`);
    }
    return data;
  }

  async getUserInfo() {
    return this._fetch("/user");
  }

  async getAccounts() {
    return this._fetch("/accounts");
  }

  async listWorkers(accountId) {
    return this._fetch(`/accounts/${accountId}/workers/services`);
  }

  async getWorkerScript(accountId, workerName) {
    const url = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/environments/production/content`;
    const response = await fetch(url, {
      headers: {
        "X-Auth-Email": this.email,
        "X-Auth-Key": this.apiKey
      }
    });

    if (!response.ok) {
      const fallbackUrl = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/content`;
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          "X-Auth-Email": this.email,
          "X-Auth-Key": this.apiKey
        }
      });
      if (!fallbackResponse.ok) throw new Error(`Failed to fetch worker script: ${fallbackResponse.status}`);
      return fallbackResponse.text();
    }

    return response.text();
  }

  async updateWorker(accountId, workerName, scriptContent) {
    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
    const metadata = {
      main_module: "worker.js",
      compatibility_date: "2024-12-03",
      compatibility_flags: ["nodejs_compat"]
    };

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
      'Content-Type: application/javascript+module',
      '',
      scriptContent,
      `--${boundary}`,
      'Content-Disposition: form-data; name="metadata"',
      'Content-Type: application/json',
      '',
      JSON.stringify(metadata),
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production`, {
      method: 'PUT',
      contentType: `multipart/form-data; boundary=${boundary}`,
      body: body
    });
  }

  async getOrCreateSubdomain(accountId) {
    try {
      const data = await this._fetch(`/accounts/${accountId}/workers/subdomain`);
      return data.result.subdomain;
    } catch (error) {
      const subdomainName = this.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      try {
        const response = await this._fetch(`/accounts/${accountId}/workers/subdomain`, {
          method: 'PUT',
          body: JSON.stringify({ subdomain: subdomainName })
        });
        return response.result.subdomain;
      } catch (e) {
        throw new Error("Failed to get or create worker subdomain: " + e.message);
      }
    }
  }

  async createWorker(accountId, workerName, scriptContent) {
    await this.updateWorker(accountId, workerName, scriptContent);
    try {
      await this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production/subdomain`, {
        method: 'POST',
        body: JSON.stringify({ enabled: true })
      });
    } catch (e) {}
    const subdomain = await this.getOrCreateSubdomain(accountId);
    return { workerName, subdomain };
  }

  async deleteWorker(accountId, workerName) {
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}`, {
      method: 'DELETE'
    });
  }

  async listZones() {
    return this._fetch("/zones?status=active&per_page=50");
  }

  async registerCustomDomain(accountId, workerName, hostname, zoneId) {
    return this._fetch(`/accounts/${accountId}/workers/domains`, {
      method: 'PUT',
      body: JSON.stringify({
        environment: "production",
        hostname: hostname,
        service: workerName,
        zone_id: zoneId
      })
    });
  }

  async listCustomDomains(accountId, serviceName) {
    return this._fetch(`/accounts/${accountId}/workers/domains?service=${serviceName}`);
  }
}

// ==================== HANDLERS ====================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handleApiRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const email = request.headers.get("X-Auth-Email");
  const apiKey = request.headers.get("X-Auth-Key");

  if (!email || !apiKey) {
    return new Response(JSON.stringify({ success: false, message: "Missing auth headers" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const client = new CfClient(email, apiKey);

  try {
    if (path === "/api/userInfo") {
      const data = await client.getUserInfo();
      return new Response(JSON.stringify({ success: true, user: data.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/listZones") {
      const data = await client.listZones();
      return new Response(JSON.stringify({ success: true, zones: data.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/accounts") {
      const data = await client.getAccounts();
      return new Response(JSON.stringify({ success: true, accounts: data.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/listWorkers") {
      const accountId = url.searchParams.get("accountId");
      const data = await client.listWorkers(accountId);
      return new Response(JSON.stringify({ success: true, workers: data.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/createWorker") {
      const { accountId, workerName, customScriptUrl } = await request.json();
      const scriptUrl = customScriptUrl || DEFAULT_SCRIPT_URL;
      const scriptResponse = await fetch(scriptUrl);
      const scriptContent = await scriptResponse.text();
      const result = await client.createWorker(accountId, sanitizeWorkerName(workerName), scriptContent);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/deleteWorker") {
      const { accountId, workerName } = await request.json();
      await client.deleteWorker(accountId, workerName);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/registerWildcard") {
      const { accountId, workerName, hostname, zoneId } = await request.json();
      await client.registerCustomDomain(accountId, workerName, hostname, zoneId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/api/listDomains") {
      const accountId = url.searchParams.get("accountId");
      const workerName = url.searchParams.get("workerName");
      const data = await client.listCustomDomains(accountId, workerName);
      return new Response(JSON.stringify({ success: true, domains: data.result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: false, message: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CF Manager Pro</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root[data-theme="light"] {
      --bg-gradient: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      --card-bg: rgba(255, 255, 255, 0.7);
      --text-color: #2d3436;
      --border-color: rgba(255, 255, 255, 0.4);
      --accent-color: #007bff;
      --glow-color: rgba(0, 123, 255, 0.2);
    }
    :root[data-theme="dark"] {
      --bg-gradient: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      --card-bg: rgba(255, 255, 255, 0.05);
      --text-color: #f5f6fa;
      --border-color: rgba(255, 255, 255, 0.1);
      --accent-color: #00d2ff;
      --glow-color: rgba(0, 210, 255, 0.3);
    }

    body {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: var(--bg-gradient);
      background-attachment: fixed;
      color: var(--text-color);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      transition: all 0.3s ease;
    }

    .glass-card {
      background: var(--card-bg);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
      padding: 2rem;
      margin-bottom: 2rem;
    }

    .navbar {
      background: var(--card-bg);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border-color);
      padding: 1rem 2rem;
      margin-bottom: 3rem;
    }

    .navbar-brand {
      color: var(--accent-color) !important;
      font-weight: 800;
      font-size: 1.5rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      text-shadow: 0 0 10px var(--glow-color);
    }

    .btn-primary {
      background: var(--accent-color);
      border: none;
      box-shadow: 0 4px 15px var(--glow-color);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px var(--glow-color);
    }

    .theme-toggle {
      background: none;
      border: 1px solid var(--border-color);
      color: var(--text-color);
      padding: 0.5rem 1rem;
      border-radius: 30px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .form-control, .form-select {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      border-radius: 8px;
    }

    .form-control:focus, .form-select:focus {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-color);
      border-color: var(--accent-color);
      box-shadow: 0 0 10px var(--glow-color);
    }

    .worker-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: 0.3s;
    }

    .worker-card:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--accent-color);
    }

    #loadingOverlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }

    .modal-content {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--border-color);
      color: var(--text-color);
    }

    .input-group-text {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      color: var(--text-color);
    }
  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg">
    <div class="container-fluid">
      <a class="navbar-brand" href="#"><i class="fas fa-bolt"></i> CF Manager</a>
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-sm btn-outline-secondary" onclick="location.reload()"><i class="fas fa-sync"></i> Refresh</button>
        <button id="themeToggle" class="theme-toggle">
          <i class="fas fa-moon"></i>
          <span>Dark</span>
        </button>
        <button class="btn btn-primary rounded-pill" data-bs-toggle="modal" data-bs-target="#loginModal">
          <i class="fas fa-plus-circle"></i> Account
        </button>
      </div>
    </div>
  </nav>

  <div class="container">
    <div id="mainContent">
      <div class="row">
        <div class="col-md-4">
          <div class="glass-card">
            <h5><i class="fas fa-user-circle"></i> Account Status</h5>
            <hr>
            <div id="accountInfo">
              <p class="text-muted">No account logged in.</p>
              <button class="btn btn-primary w-100" data-bs-toggle="modal" data-bs-target="#loginModal">Login Now</button>
            </div>
            <div id="loggedInInfo" style="display:none;">
              <p class="mb-1"><strong>Email:</strong></p>
              <p id="displayEmail" class="text-truncate"></p>
              <p class="mb-1"><strong>Selected ID:</strong></p>
              <select id="accountIdSelect" class="form-select mb-3"></select>
              <button class="btn btn-danger btn-sm w-100" onclick="logout()">Logout</button>
            </div>
          </div>

          <div class="glass-card" id="actionsCard" style="display:none;">
            <h5><i class="fas fa-tasks"></i> Quick Actions</h5>
            <hr>
            <button class="btn btn-success w-100 mb-2" onclick="showCreateWorkerModal()">
              <i class="fas fa-plus"></i> Create Worker
            </button>
            <button class="btn btn-info w-100" onclick="showWildcardModal()">
              <i class="fas fa-globe"></i> Wildcard Domain
            </button>
          </div>
        </div>

        <div class="col-md-8">
          <div class="glass-card">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h4 class="m-0"><i class="fas fa-list"></i> Workers List</h4>
              <span class="badge bg-primary" id="workerCount">0 Workers</span>
            </div>
            <div id="workerList">
              <div class="text-center py-5 text-muted">
                <i class="fas fa-cloud fa-3x mb-3"></i>
                <p>Connect your account to see workers</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Login Modal -->
  <div class="modal fade" id="loginModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0">
          <h5 class="modal-title">Cloudflare Login</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Email Address</label>
            <input type="email" id="loginEmail" class="form-control" placeholder="email@example.com">
          </div>
          <div class="mb-3">
            <label class="form-label">Global API Key</label>
            <div class="input-group">
              <input type="password" id="loginApiKey" class="form-control" placeholder="Your API Key">
              <button class="btn btn-outline-secondary" type="button" onclick="togglePassword('loginApiKey')">
                <i class="fas fa-eye"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer border-0">
          <button type="button" class="btn btn-primary w-100" onclick="login()">Login to Cloudflare</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Worker Modal -->
  <div class="modal fade" id="createWorkerModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0">
          <h5 class="modal-title">Create New Worker</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Worker Name</label>
            <input type="text" id="newWorkerName" class="form-control" placeholder="my-awesome-worker">
          </div>
          <div class="mb-3">
            <label class="form-label">Custom Template (Optional)</label>
            <input type="text" id="customScriptUrl" class="form-control" placeholder="https://raw.../worker.js">
          </div>
        </div>
        <div class="modal-footer border-0">
          <button type="button" class="btn btn-primary w-100" onclick="createWorker()">Deploy Worker</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Wildcard Modal -->
  <div class="modal fade" id="wildcardModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0">
          <h5 class="modal-title">Wildcard Registration</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Account</label>
            <input type="text" id="wildcardAccountId" class="form-control" readonly>
          </div>
          <div class="mb-3">
            <label class="form-label">Cloudflare Domain (Zone)</label>
            <select id="wildcardZoneSelect" class="form-select">
              <option value="">Select Domain</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label">Target Worker</label>
            <select id="wildcardWorkerSelect" class="form-select">
              <option value="">Loading workers...</option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label">Subdomain</label>
            <div class="input-group">
              <input type="text" id="subdomainPrefix" class="form-control" placeholder="e.g. api or api.vpn">
              <span class="input-group-text" id="domainSuffix">.domain.com</span>
            </div>
            <small class="text-muted">Just input the subdomain part.</small>
          </div>
        </div>
        <div class="modal-footer border-0">
          <button type="button" class="btn btn-primary w-100" onclick="registerWildcard()">Register</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="listWorkerDomains()"><i class="fas fa-list"></i></button>
        </div>
        <div id="domainsResult" class="p-3" style="display:none;"></div>
      </div>
    </div>
  </div>

  <div id="loadingOverlay">
    <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    let currentAuth = JSON.parse(localStorage.getItem('cf_auth') || 'null');
    let zones = [];
    let workers = [];

    // Theme Management
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    function setTheme(theme) {
      html.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      themeToggle.querySelector('i').className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      themeToggle.querySelector('span').textContent = theme === 'dark' ? 'Light' : 'Dark';
    }

    themeToggle.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });

    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    // Auth & UI State
    if (currentAuth) {
      updateUI();
      fetchWorkers();
      fetchZones();
      fetchAccounts();
    }

    function togglePassword(id) {
      const input = document.getElementById(id);
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    async function login() {
      const email = document.getElementById('loginEmail').value;
      const apiKey = document.getElementById('loginApiKey').value;

      showLoading(true);
      try {
        const res = await fetch('/api/userInfo', {
          headers: { 'X-Auth-Email': email, 'X-Auth-Key': apiKey }
        });
        const data = await res.json();
        if (data.success) {
          currentAuth = { email, apiKey };
          localStorage.setItem('cf_auth', JSON.stringify(currentAuth));
          bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
          updateUI();
          await fetchAccounts();
          await fetchWorkers();
          await fetchZones();
        } else {
          alert('Login failed: ' + data.message);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      } finally {
        showLoading(false);
      }
    }

    function logout() {
      localStorage.removeItem('cf_auth');
      currentAuth = null;
      location.reload();
    }

    function updateUI() {
      if (currentAuth) {
        document.getElementById('accountInfo').style.display = 'none';
        document.getElementById('loggedInInfo').style.display = 'block';
        document.getElementById('actionsCard').style.display = 'block';
        document.getElementById('displayEmail').textContent = currentAuth.email;
        document.getElementById('wildcardAccountId').value = currentAuth.accountId || 'Select ID above';
      }
    }

    async function fetchAccounts() {
      const res = await fetch('/api/accounts', {
        headers: { 'X-Auth-Email': currentAuth.email, 'X-Auth-Key': currentAuth.apiKey }
      });
      const data = await res.json();
      if (data.success) {
        const select = document.getElementById('accountIdSelect');
        select.innerHTML = data.accounts.map(acc => '<option value="' + acc.id + '">' + acc.name + '</option>').join('');
        currentAuth.accountId = select.value;
        document.getElementById('wildcardAccountId').value = currentAuth.accountId;
        select.onchange = () => {
          currentAuth.accountId = select.value;
          document.getElementById('wildcardAccountId').value = currentAuth.accountId;
          fetchWorkers();
        };
      }
    }

    async function fetchWorkers() {
      if (!currentAuth.accountId) return;
      const res = await fetch('/api/listWorkers?accountId=' + currentAuth.accountId, {
        headers: { 'X-Auth-Email': currentAuth.email, 'X-Auth-Key': currentAuth.apiKey }
      });
      const data = await res.json();
      if (data.success) {
        workers = data.workers;
        renderWorkers();
        document.getElementById('wildcardWorkerSelect').innerHTML = workers.map(w => '<option value="' + w.name + '">' + w.name + '</option>').join('');
      }
    }

    async function fetchZones() {
      const res = await fetch('/api/listZones', {
        headers: { 'X-Auth-Email': currentAuth.email, 'X-Auth-Key': currentAuth.apiKey }
      });
      const data = await res.json();
      if (data.success) {
        zones = data.zones;
        const select = document.getElementById('wildcardZoneSelect');
        select.innerHTML = '<option value="">Select Domain</option>' + zones.map(z => '<option value="' + z.id + '" data-name="' + z.name + '">' + z.name + '</option>').join('');
        select.onchange = () => {
          const opt = select.options[select.selectedIndex];
          document.getElementById('domainSuffix').textContent = opt.value ? '.' + opt.dataset.name : '.domain.com';
        };
      }
    }

    function renderWorkers() {
      const list = document.getElementById('workerList');
      document.getElementById('workerCount').textContent = workers.length + ' Workers';

      if (workers.length === 0) {
        list.innerHTML = '<div class="text-center py-5 text-muted"><p>No workers found.</p></div>';
        return;
      }

      list.innerHTML = workers.map(w => \`
        <div class="worker-card">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-1 text-info">\${w.name}</h6>
              <small class="text-muted">Modified: \${new Date(w.modified_on).toLocaleDateString()}</small>
            </div>
            <div class="btn-group">
              <button class="btn btn-outline-danger btn-sm" onclick="deleteWorker('\${w.name}')"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        </div>
      \`).join('');
    }

    async function createWorker() {
      const name = document.getElementById('newWorkerName').value;
      const customUrl = document.getElementById('customScriptUrl').value;
      if (!name) return alert('Name required');

      showLoading(true);
      try {
        const res = await fetch('/api/createWorker', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAuth.email,
            'X-Auth-Key': currentAuth.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ accountId: currentAuth.accountId, workerName: name, customScriptUrl: customUrl })
        });
        const data = await res.json();
        if (data.success) {
          bootstrap.Modal.getInstance(document.getElementById('createWorkerModal')).hide();
          alert('Worker deployed successfully!');
          fetchWorkers();
        } else {
          alert('Failed: ' + data.message);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      } finally {
        showLoading(false);
      }
    }

    async function deleteWorker(name) {
      if (!confirm('Are you sure you want to delete worker: ' + name + '?')) return;
      showLoading(true);
      try {
        const res = await fetch('/api/deleteWorker', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAuth.email,
            'X-Auth-Key': currentAuth.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ accountId: currentAuth.accountId, workerName: name })
        });
        const data = await res.json();
        if (data.success) {
          fetchWorkers();
        } else {
          alert('Delete failed: ' + data.message);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      } finally {
        showLoading(false);
      }
    }

    async function registerWildcard() {
      const zoneId = document.getElementById('wildcardZoneSelect').value;
      const workerName = document.getElementById('wildcardWorkerSelect').value;
      const prefix = document.getElementById('subdomainPrefix').value;
      const zoneName = document.getElementById('wildcardZoneSelect').options[document.getElementById('wildcardZoneSelect').selectedIndex].dataset.name;

      if (!zoneId || !workerName || !prefix) return alert('All fields required');

      const hostname = prefix + '.' + zoneName;
      showLoading(true);
      try {
        const res = await fetch('/api/registerWildcard', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAuth.email,
            'X-Auth-Key': currentAuth.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ accountId: currentAuth.accountId, workerName, hostname, zoneId })
        });
        const data = await res.json();
        if (data.success) {
          alert('Domain registered: ' + hostname);
        } else {
          alert('Failed: ' + data.message);
        }
      } catch (e) {
        alert('Error: ' + e.message);
      } finally {
        showLoading(false);
      }
    }

    async function listWorkerDomains() {
      const workerName = document.getElementById('wildcardWorkerSelect').value;
      if (!workerName) return alert('Select a worker first');

      const res = await fetch('/api/listDomains?accountId=' + currentAuth.accountId + '&workerName=' + workerName, {
        headers: { 'X-Auth-Email': currentAuth.email, 'X-Auth-Key': currentAuth.apiKey }
      });
      const data = await res.json();
      const div = document.getElementById('domainsResult');
      div.style.display = 'block';
      if (data.success && data.domains.length > 0) {
        div.innerHTML = '<h6>Registered Domains:</h6><ul>' + data.domains.map(d => '<li>' + d.hostname + '</li>').join('') + '</ul>';
      } else {
        div.innerHTML = '<p class="text-muted">No domains found for this worker.</p>';
      }
    }

    function showLoading(show) {
      document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    function showCreateWorkerModal() {
      new bootstrap.Modal(document.getElementById('createWorkerModal')).show();
    }

    function showWildcardModal() {
      new bootstrap.Modal(document.getElementById('wildcardModal')).show();
    }
  </script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request);
    }

    return new Response(HTML_CONTENT, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  }
};
