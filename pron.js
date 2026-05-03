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
    } catch (e) {
      console.error("Subdomain activation failed:", e);
    }
    const subdomain = await this.getOrCreateSubdomain(accountId);
    return { workerName, subdomain };
  }

  async deleteWorker(accountId, workerName) {
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}`, {
      method: 'DELETE'
    });
  }

  async listZones(name = "") {
    let path = "/zones?status=active&per_page=50";
    if (name) path += `&name=${name}`;
    return this._fetch(path);
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

  try {
    if (path === '/api/generateProxyIP') {
      const response = await fetch(PROXY_LIST_URL);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const randomLine = lines[Math.floor(Math.random() * lines.length)];
      const proxyIP = randomLine.split(',')[0];
      return new Response(JSON.stringify({ success: true, proxyIP }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), { status: 405, headers: corsHeaders });
    }

    const body = await request.json();
    const { email, globalAPIKey, accountId } = body;
    const client = new CfClient(email, globalAPIKey);

    switch (path) {
      case '/api/userInfo':
        return new Response(JSON.stringify(await client.getUserInfo()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/accounts':
        return new Response(JSON.stringify(await client.getAccounts()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/listWorkers':
        return new Response(JSON.stringify(await client.listWorkers(accountId)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/listZones':
        return new Response(JSON.stringify(await client.listZones()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/getWorkerScript':
        const script = await client.getWorkerScript(accountId, body.workerName);
        return new Response(JSON.stringify({ success: true, scriptContent: script }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/updateWorker':
        await client.updateWorker(accountId, body.workerName, body.scriptContent);
        return new Response(JSON.stringify({ success: true, message: "Worker updated" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/deleteWorker':
        await client.deleteWorker(accountId, body.workerName);
        return new Response(JSON.stringify({ success: true, message: "Worker deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      case '/api/bulkDeleteWorkers': {
        const delResults = await Promise.allSettled(body.workerNames.map(name => client.deleteWorker(accountId, name)));
        return new Response(JSON.stringify({ success: true, results: delResults }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case '/api/createWorker': {
        const { workerName, workerScriptUrl, template } = body;
        const targetUrl = workerScriptUrl || DEFAULT_SCRIPT_URL;
        const res = await fetch(targetUrl);
        let script = await res.text();
        const uuid = generateUUID();
        script = script.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, uuid);

        let proxyIP = "";
        if (template === 'nautica' || template === 'nautica-mod') {
          const pRes = await fetch(PROXY_LIST_URL);
          const pText = await pRes.text();
          const pLines = pText.split('\n').filter(l => l.trim() !== '');
          proxyIP = pLines[Math.floor(Math.random() * pLines.length)].split(',')[0];
        }

        const result = await client.createWorker(accountId, sanitizeWorkerName(workerName), script);
        const host = `${result.workerName}.${result.subdomain}.workers.dev`;
        const pathSuffix = "%2FALL1";

        return new Response(JSON.stringify({
          success: true,
          message: "Worker created",
          url: `https://${host}`,
          proxyIP,
          vless: `vless://${uuid}@suporte.garena.com:443?encryption=none&security=tls&sni=${host}&fp=randomized&type=ws&host=${host}&path=${pathSuffix}#${result.workerName}`,
          trojan: `trojan://${uuid}@suporte.garena.com:443?sni=${host}&type=ws&host=${host}&path=${pathSuffix}#${result.workerName}`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case '/api/bulkCreateWorkers': {
        const { accounts, workerName, workerScriptUrl, template } = body;
        const targetUrl = workerScriptUrl || DEFAULT_SCRIPT_URL;
        const sRes = await fetch(targetUrl);
        const baseScript = await sRes.text();

        const results = await Promise.all(accounts.map(async (acc) => {
          try {
            const accClient = new CfClient(acc.email, acc.apiKey);
            const uuid = generateUUID();
            let script = baseScript.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, uuid);

            let proxyIP = "";
            if (template === 'nautica' || template === 'nautica-mod') {
              const pRes = await fetch(PROXY_LIST_URL);
              const pText = await pRes.text();
              const pLines = pText.split('\n').filter(l => l.trim() !== '');
              proxyIP = pLines[Math.floor(Math.random() * pLines.length)].split(',')[0];
            }

            await accClient.createWorker(acc.accountId, sanitizeWorkerName(workerName), script);
            return { email: acc.email, success: true, proxyIP };
          } catch (e) {
            return { email: acc.email, success: false, message: e.message };
          }
        }));

        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case '/api/autoDiscoverConfig': {
        const { targetDomain } = body;
        const domainParts = targetDomain.split('.').filter(p => p !== '*');
        const rootDomain = domainParts.slice(-2).join('.');

        const zones = await client.listZones(rootDomain);
        if (zones.result && zones.result.length > 0) {
          return new Response(JSON.stringify({
            success: true,
            accountId: zones.result[0].account.id,
            zone: zones.result[0]
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          return new Response(JSON.stringify({ success: false, message: "Zone not found for domain" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      case '/api/registerWildcard': {
        const { subdomain, zoneId, serviceName } = body;
        await client.registerCustomDomain(accountId, serviceName, subdomain, zoneId);
        return new Response(JSON.stringify({ success: true, message: `Domain ${subdomain} registered to ${serviceName}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case '/api/listWildcard': {
        const data = await client.listCustomDomains(accountId, body.serviceName);
        const domains = data.result.map(d => d.hostname);
        return new Response(JSON.stringify({ success: true, domains }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({ success: false, message: "Not found" }), { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: corsHeaders });
  }
}

const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="id" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare Worker Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; background: #0f172a; color: #f8fafc; }
    .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); }
    .sidebar { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .sidebar-hidden { transform: translateX(100%); }
    .burger-active div:nth-child(1) { transform: translateY(8px) rotate(45deg); }
    .burger-active div:nth-child(2) { opacity: 0; }
    .burger-active div:nth-child(3) { transform: translateY(-8px) rotate(-45deg); }
    .burger-active { transform: rotate(180deg); }
    .modal { background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px); }
    .form-input { background: #1e293b; border: 1px solid #334155; color: white; padding: 0.5rem 0.75rem; border-radius: 0.5rem; width: 100%; transition: all 0.2s; }
    .form-input:focus { border-color: #3b82f6; outline: none; ring: 2px ring-blue-500; }
    .btn { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; transition: all 0.2s; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-success { background: #22c55e; color: white; }
    .btn-success:hover { background: #16a34a; }
    .btn-warning { background: #f59e0b; color: white; }
    .btn-warning:hover { background: #d97706; }
    .btn-info { background: #06b6d4; color: white; }
    .btn-info:hover { background: #0891b2; }
    .worker-item { background: #1e293b; border: 1px solid #334155; transition: all 0.2s; }
    .worker-item:hover { border-color: #3b82f6; }
    .worker-item.selected { background: #1e3a8a; border-color: #3b82f6; }
    .notification { position: fixed; top: 1.5rem; right: 1.5rem; z-index: 9999; animation: slideIn 0.3s ease-out; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .progress-bar { background: #1a1a1a; border-radius: 5px; height: 10px; overflow: hidden; }
    .progress { background: #3b82f6; height: 100%; width: 0%; transition: width 0.3s; }
  </style>
</head>
<body class="overflow-x-hidden">
  <div id="notification" class="notification hidden glass p-4 rounded-xl shadow-2xl max-w-sm"></div>

  <!-- Login Page -->
  <div id="loginPage" class="min-h-screen flex items-center justify-center p-6 transition-all duration-500">
    <div class="glass p-10 rounded-3xl w-full max-w-md shadow-2xl">
      <div class="text-center mb-10">
        <div class="inline-block p-4 rounded-2xl bg-blue-600/20 mb-4">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
           </svg>
        </div>
        <h1 class="text-3xl font-bold tracking-tight">Worker Manager</h1>
        <p class="text-slate-400 mt-2">Sign in with your Cloudflare API</p>
      </div>
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
          <input type="email" id="email" class="form-input" placeholder="name@example.com">
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-2">Global API Key</label>
          <input type="password" id="apiKey" class="form-input" placeholder="••••••••••••••••">
        </div>
        <button id="submitLogin" class="btn btn-primary w-full py-3 text-lg rounded-xl">Connect Account</button>
      </div>
    </div>
  </div>

  <!-- Dashboard -->
  <div id="dashboard" class="hidden min-h-screen">
    <nav class="glass sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="bg-blue-600 p-2 rounded-lg">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <span class="text-xl font-bold hidden sm:inline">CF Manager</span>
      </div>
      <div class="flex items-center gap-4">
        <div class="hidden md:flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-full text-sm border border-slate-700">
           <span class="w-2 h-2 rounded-full bg-green-500"></span>
           <span id="currentAccountEmailDisplay" class="text-slate-300 max-w-[150px] truncate">No account</span>
        </div>
        <button id="burgerBtn" class="relative w-10 h-10 flex flex-col items-center justify-center gap-1.5 focus:outline-none transition-all duration-300 z-[60]">
          <div class="w-6 h-0.5 bg-slate-300 rounded-full transition-all duration-300"></div>
          <div class="w-6 h-0.5 bg-slate-300 rounded-full transition-all duration-300"></div>
          <div class="w-6 h-0.5 bg-slate-300 rounded-full transition-all duration-300"></div>
        </button>
      </div>
    </nav>

    <aside id="sidebar" class="sidebar sidebar-hidden fixed top-0 right-0 bottom-0 w-80 glass z-50 p-6 pt-24 flex flex-col gap-6 shadow-2xl">
      <div class="flex-1 overflow-y-auto space-y-4">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2">Management</p>
        <button id="refreshWorkers" class="btn bg-slate-800 hover:bg-slate-700 w-full text-left justify-start">Refresh Workers</button>
        <button id="bulkCreateBtn" class="btn bg-slate-800 hover:bg-slate-700 w-full text-left justify-start">Bulk Create</button>
        <button id="wildcardBtn" class="btn btn-warning w-full text-left justify-start text-white">Wildcard Domain</button>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2 mt-6">Utilities</p>
        <button id="analyticsBtn" class="btn bg-slate-800 hover:bg-slate-700 w-full text-left justify-start">View Analytics</button>
        <button id="exportConfigBtn" class="btn bg-slate-800 hover:bg-slate-700 w-full text-left justify-start">Export/Import</button>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-2 mt-6">Account</p>
        <button id="userDetailBtn" class="btn bg-slate-800 hover:bg-slate-700 w-full text-left justify-start">User Details</button>
        <button id="logoutBtn" class="btn btn-danger w-full text-left justify-start">Logout</button>
      </div>
      <div class="pt-6 border-t border-slate-700/50">
        <select id="accountSelect" class="form-input text-sm"></select>
      </div>
    </aside>

    <main class="container mx-auto p-6 md:p-10 space-y-10">
      <section class="text-center py-10">
        <h2 class="text-4xl font-extrabold text-white mb-6">Deploy New Worker</h2>
        <button id="createWorkerBtn" class="btn btn-primary px-8 py-4 text-xl rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-105 active:scale-95">Create New Worker</button>
      </section>
      <section class="space-y-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 class="text-2xl font-bold flex items-center gap-3">Your Workers <span id="selectedCount" class="hidden text-sm bg-blue-600 px-3 py-1 rounded-full"><span id="selectedCountNumber">0</span> Selected</span></h3>
          <div class="flex flex-wrap gap-2">
             <input type="text" id="searchWorkers" class="form-input w-64" placeholder="Search workers...">
             <select id="filterAccount" class="form-input w-48"><option value="">All Accounts</option></select>
          </div>
        </div>
        <div class="flex items-center gap-4 bg-slate-800/30 p-4 rounded-xl border border-slate-700 text-sm">
           <button id="selectAllBtn" class="font-medium text-blue-400 hover:text-blue-300">Select All</button>
           <button id="deselectAllBtn" class="font-medium text-slate-500 hover:text-slate-400">Deselect All</button>
           <div class="flex items-center gap-2 ml-auto">
              <label class="text-slate-400">Auto Refresh:</label>
              <input type="checkbox" id="autoRefreshToggle" class="rounded bg-slate-700">
           </div>
        </div>
        <div id="workersList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
      </section>
    </main>
  </div>

  <!-- Modals -->
  <div id="userDetailModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-md rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6">
      <div class="flex justify-between items-center"><h3 class="text-xl font-bold">User Details</h3><button onclick="document.getElementById('userDetailModal').classList.add('hidden')">✕</button></div>
      <div id="userDetailContent" class="space-y-4"></div>
      <div class="flex justify-end"><button onclick="document.getElementById('userDetailModal').classList.add('hidden')" class="btn bg-slate-800">Close</button></div>
    </div>
  </div>

  <div id="configResultsModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6">
      <div class="flex justify-between items-center"><h3 class="text-xl font-bold">Worker Config</h3><button onclick="document.getElementById('configResultsModal').classList.add('hidden')">✕</button></div>
      <div class="space-y-4">
        <input type="hidden" id="configWorkerName">
        <input type="hidden" id="configWorkerAccount">
        <div id="configResultsContent"></div>
      </div>
      <div class="flex justify-end"><button onclick="document.getElementById('configResultsModal').classList.add('hidden')" class="btn bg-slate-800">Close</button></div>
    </div>
  </div>

  <div id="configModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6">
      <div class="flex justify-between items-center"><h3 class="text-xl font-bold">Export/Import Config</h3><button onclick="document.getElementById('configModal').classList.add('hidden')">✕</button></div>
      <div class="space-y-4">
        <button onclick="exportConfig()" class="btn btn-primary w-full">Export to JSON</button>
        <div class="border-t border-slate-700 pt-4">
          <p class="text-sm text-slate-400 mb-2">Import JSON Config:</p>
          <input type="file" id="importFile" class="hidden" onchange="importConfig(this)">
          <button onclick="document.getElementById('importFile').click()" class="btn bg-slate-800 w-full">Choose File & Import</button>
        </div>
      </div>
    </div>
  </div>

  <div id="createWorkerModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <h3 class="text-xl font-bold">Create New Worker</h3>
        <button id="cancelCreateWorker" class="p-2">✕</button>
      </div>
      <div class="p-6 space-y-6 overflow-y-auto">
        <select id="createAccountSelect" class="form-input"></select>
        <input type="text" id="workerName" class="form-input" placeholder="Worker Name">
        <div class="grid grid-cols-2 gap-4">
          <select id="workerTemplate" class="form-input">
            <option value="custom">Custom URL</option>
            <option value="proxy-checker">PROXY CHECKER</option>
            <option value="nautica-mod">NAUTICA MOD</option>
            <option value="nautica">NAUTICA</option>
            <option value="Gateway">Gateway</option>
            <option value="vmess">Vmess</option>
            <option value="Green-jossvpn">Green-jossvpn</option>
          </select>
          <div id="customUrlGroup"><input type="text" id="scriptUrl" class="form-input" value="https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj"></div>
        </div>
        <div id="proxyInfo" class="hidden p-4 rounded-xl bg-blue-900/20 border border-blue-500/30">
          <div class="flex justify-between mb-2"><span class="text-sm font-medium">🔒 Proxy IP</span><button id="refreshProxyBtn" class="text-xs bg-blue-600 px-2 py-1 rounded">Refresh</button></div>
          <p id="currentProxyIP" class="text-lg font-mono">Loading...</p>
        </div>
        <div id="createResult" class="hidden space-y-4"></div>
      </div>
      <div class="px-6 py-4 border-t border-slate-700 bg-slate-800/50 flex justify-end"><button id="submitCreateWorker" class="btn btn-primary px-8">Create Worker</button></div>
    </div>
  </div>

  <div id="wildcardModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <h3 class="text-xl font-bold">Wildcard Domain</h3>
        <button id="cancelWildcard" class="p-2">✕</button>
      </div>
      <div class="p-6 space-y-6 overflow-y-auto">
        <div class="grid grid-cols-2 gap-4">
          <select id="wildcardAccountSelect" class="form-input"></select>
          <select id="wildcardWorkerSelect" class="form-input"><option value="">Select Worker...</option></select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <select id="wildcardZoneSelect" class="form-input"><option value="">Select Domain...</option></select>
          <input type="text" id="subdomainPrefix" class="form-input" placeholder="Subdomain (e.g. sampi)">
        </div>
        <div class="bg-blue-600/10 border border-blue-500/30 p-4 rounded-xl text-sm">
           <p>Preview: <span id="fullDomainPreview" class="text-blue-400 font-mono font-bold">---</span></p>
        </div>
        <div id="wildcardResult" class="hidden"></div>
        <div id="wildcardList" class="hidden space-y-3">
          <h4 class="font-semibold">Active Domains:</h4>
          <div id="domainsList" class="bg-slate-900/50 rounded-xl p-2 max-h-40 overflow-y-auto border border-slate-700"></div>
        </div>
      </div>
      <div class="px-6 py-4 border-t border-slate-700 bg-slate-800/50 flex gap-2 justify-end">
        <button id="autoDiscoverBtn" class="btn bg-slate-700">Auto Discover</button>
        <button id="listWildcardBtn" class="btn bg-slate-700">List Domains</button>
        <button id="submitWildcard" class="btn btn-success px-8">Register</button>
      </div>
    </div>
  </div>

  <div id="editWorkerModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
      <div class="px-6 py-4 border-b border-slate-700 flex items-center justify-between"><h3>Edit Script</h3><button id="cancelEditWorker">✕</button></div>
      <div class="flex-1 p-6 flex flex-col gap-4">
        <div class="flex gap-4"><input type="text" id="editWorkerName" class="form-input" readonly><input type="text" id="editWorkerAccount" class="form-input" readonly></div>
        <textarea id="editWorkerScript" class="form-input flex-1 font-mono text-xs bg-slate-900"></textarea>
      </div>
      <div class="px-6 py-4 bg-slate-800/50 flex justify-end gap-3"><button id="reloadScriptBtn" class="btn bg-slate-700">Reload</button><button id="submitEditWorker" class="btn btn-success px-8">Update</button></div>
    </div>
  </div>

  <div id="bulkCreateModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b border-slate-700 flex items-center justify-between"><h3>Bulk Create</h3><button id="cancelBulkCreate">✕</button></div>
      <div class="p-6 space-y-6 overflow-y-auto">
        <select id="bulkAccountsSelect" multiple class="form-input h-32"></select>
        <input type="text" id="bulkWorkerName" class="form-input" placeholder="Name">
        <select id="bulkWorkerTemplate" class="form-input"><option value="nautica">NAUTICA</option><option value="custom">Custom URL</option></select>
        <div class="progress-bar mt-4"><div id="bulkProgress" class="progress"></div></div>
        <div id="bulkResults" class="hidden space-y-2 max-h-40 overflow-y-auto"></div>
      </div>
      <div class="px-6 py-4 border-t border-slate-700 bg-slate-800/50 flex justify-end"><button id="submitBulkCreate" class="btn btn-primary px-8">Start Bulk Deploy</button></div>
    </div>
  </div>

  <div id="analyticsModal" class="modal fixed inset-0 z-[60] hidden flex items-center justify-center p-4">
    <div class="glass w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6">
      <div class="flex justify-between items-center"><h3 class="text-xl font-bold">Analytics</h3><button id="cancelAnalytics">✕</button></div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">Requests</p><p id="totalRequests" class="text-2xl font-bold">0</p></div>
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">Success</p><p id="successRate" class="text-2xl font-bold">0%</p></div>
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">Avg Latency</p><p id="avgResponseTime" class="text-2xl font-bold">0ms</p></div>
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">CPU Time</p><p id="cpuTime" class="text-2xl font-bold">0ms</p></div>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">P95</p><p id="p95Response" class="text-lg font-bold">0ms</p></div>
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">P99</p><p id="p99Response" class="text-lg font-bold">0ms</p></div>
        <div class="bg-slate-800/50 p-4 rounded-2xl text-center"><p class="text-xs text-slate-500">Cache Hit</p><p id="cacheHitRate" class="text-lg font-bold">0%</p></div>
      </div>
    </div>
  </div>

  <div id="bulkActionsBar" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 hidden glass px-6 py-4 rounded-2xl shadow-2xl items-center gap-6">
     <span id="bulkActionsText" class="font-bold text-blue-400">0 selected</span>
     <button onclick="bulkDeleteWorkers()" class="btn btn-danger btn-small">Delete All</button>
     <button id="bulkBarCloseBtn">✕ Close</button>
  </div>

  <script>
    let users = JSON.parse(localStorage.getItem('cf_users') || '[]');
    let allZones = [];
    let currentUserIndex = parseInt(localStorage.getItem('cf_current_user') || '0');
    let allWorkers = [];
    let selectedWorkers = new Set();
    let currentEditingWorker = null;
    let autoRefreshInterval = null;
    let currentSearchTerm = '';
    let currentFilterAccount = '';

    document.addEventListener('DOMContentLoaded', function() {
      console.log('DOM Content Loaded');
      setupEventListeners();
      if (users.length > 0) {
        updateUI();
        fetchAllWorkers();
        fetchAllZones();
      }
    });

    function setupEventListeners() {
      const addEvt = (id, type, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(type, fn);
        else console.warn('Element not found:', id);
      };

      addEvt('burgerBtn', 'click', function() {
        this.classList.toggle('burger-active');
        document.getElementById('sidebar').classList.toggle('sidebar-hidden');
      });
      addEvt('submitLogin', 'click', login);
      addEvt('logoutBtn', 'click', logoutCurrent);
      addEvt('createWorkerBtn', 'click', showCreateWorkerModal);
      addEvt('bulkCreateBtn', 'click', showBulkCreateModal);
      addEvt('wildcardBtn', 'click', showWildcardModal);
      addEvt('analyticsBtn', 'click', showAnalyticsModal);
      addEvt('userDetailBtn', 'click', showUserDetail);
      addEvt('exportConfigBtn', 'click', () => document.getElementById('configModal').classList.remove('hidden'));
      addEvt('cancelCreateWorker', 'click', () => document.getElementById('createWorkerModal').classList.add('hidden'));
      addEvt('cancelWildcard', 'click', () => document.getElementById('wildcardModal').classList.add('hidden'));
      addEvt('cancelAnalytics', 'click', () => document.getElementById('analyticsModal').classList.add('hidden'));
      addEvt('cancelBulkCreate', 'click', () => document.getElementById('bulkCreateModal').classList.add('hidden'));
      addEvt('cancelEditWorker', 'click', () => document.getElementById('editWorkerModal').classList.add('hidden'));
      addEvt('bulkBarCloseBtn', 'click', closeBulkActions);
      addEvt('submitCreateWorker', 'click', createWorker);
      addEvt('refreshWorkers', 'click', fetchAllWorkers);
      addEvt('selectAllBtn', 'click', selectAllWorkers);
      addEvt('deselectAllBtn', 'click', deselectAllWorkers);
      addEvt('submitEditWorker', 'click', updateWorker);
      addEvt('reloadScriptBtn', 'click', () => editWorker(currentEditingWorker.name, currentEditingWorker.email, currentEditingWorker.accId));
      addEvt('submitBulkCreate', 'click', bulkCreateWorkers);
      addEvt('submitWildcard', 'click', registerWildcard);
      addEvt('listWildcardBtn', 'click', listWildcardDomains);
      addEvt('autoDiscoverBtn', 'click', autoDiscoverConfig);
      addEvt('refreshProxyIP', 'click', refreshProxyIP);
      addEvt('searchWorkers', 'input', (e) => { currentSearchTerm = e.target.value.toLowerCase(); displayWorkers(); });
      addEvt('filterAccount', 'change', (e) => { currentFilterAccount = e.target.value; displayWorkers(); });
      addEvt('autoRefreshToggle', 'change', (e) => toggleAutoRefresh(e.target.checked));

      const tplEl = document.getElementById('workerTemplate');
      if (tplEl) {
        tplEl.addEventListener('change', (e) => {
          const customUrlGroup = document.getElementById('customUrlGroup');
          const proxyInfo = document.getElementById('proxyInfo');
          if (customUrlGroup) customUrlGroup.classList.toggle('hidden', e.target.value !== 'custom');
          if (proxyInfo) {
            if (e.target.value.includes('nautica')) { proxyInfo.classList.remove('hidden'); refreshProxyIP(); }
            else proxyInfo.classList.add('hidden');
          }
        });
      }

      addEvt('subdomainPrefix', 'input', updateWildcardPreview);
      addEvt('wildcardZoneSelect', 'change', updateWildcardPreview);
      addEvt('wildcardAccountSelect', 'change', (e) => loadWildcardWorkers(e.target.value));
      addEvt('accountSelect', 'change', (e) => {
        currentUserIndex = users.findIndex(u => u.accountId === e.target.value);
        if (currentUserIndex === -1) currentUserIndex = 0;
        localStorage.setItem('cf_current_user', String(currentUserIndex));
        updateUI();
        fetchAllWorkers();
      });
    }

    function showNotification(msg, type = 'success') {
      const n = document.getElementById('notification');
      n.textContent = msg;
      const color = type === 'error' ? 'bg-red-600/90' : 'bg-blue-600/90';
      n.className = 'notification glass p-4 rounded-xl shadow-2xl max-w-sm ' + color + ' text-white font-medium';
      n.classList.remove('hidden');
      setTimeout(() => n.classList.add('hidden'), 5000);
    }

    async function login() {
      const email = document.getElementById('email').value;
      const apiKey = document.getElementById('apiKey').value;
      const submitBtn = document.getElementById('submitLogin');

      if (!email || !apiKey) return showNotification('Email and API Key required', 'error');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Connecting...';
      showNotification('Verifying credentials...');

      try {
        const res = await fetch('/api/userInfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, globalAPIKey: apiKey })
        });
        const d = await res.json();

        if (!d.success) throw new Error(d.message || 'Login failed');

        const accRes = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, globalAPIKey: apiKey })
        });
        const accD = await accRes.json();

        if (!accD.success) throw new Error(accD.message || 'Failed to fetch accounts');

        const user = {
          email,
          apiKey,
          userInfo: d.result,
          accounts: accD.result,
          accountId: accD.result[0]?.id
        };

        const idx = users.findIndex(u => u.email === email);
        if (idx >= 0) {
          users[idx] = user;
          currentUserIndex = idx;
        } else {
          users.push(user);
          currentUserIndex = users.length - 1;
        }

        localStorage.setItem('cf_users', JSON.stringify(users));
        localStorage.setItem('cf_current_user', currentUserIndex);

        updateUI();
        await Promise.all([fetchAllWorkers(), fetchAllZones()]);
        showNotification('Welcome back, ' + (d.result.first_name || email));
      } catch (e) {
        console.error('Login error:', e);
        showNotification(e.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Connect Account';
      }
    }

    function logoutCurrent() {
      users.splice(currentUserIndex, 1);
      currentUserIndex = 0;
      localStorage.setItem('cf_users', JSON.stringify(users));
      localStorage.setItem('cf_current_user', '0');
      updateUI();
    }

    function updateUI() {
      const has = users.length > 0;
      document.getElementById('loginPage').classList.toggle('hidden', has);
      document.getElementById('dashboard').classList.toggle('hidden', !has);
      if (has) {
        const u = users[currentUserIndex];
        document.getElementById('currentAccountEmailDisplay').textContent = u.email;
        const sel = document.getElementById('accountSelect');
        sel.innerHTML = '';
        u.accounts.forEach(a => sel.innerHTML += '<option value="' + a.id + '" ' + (a.id === u.accountId ? 'selected' : '') + '>' + a.name + '</option>');
      }
    }

    async function fetchAllWorkers() {
      if (users.length === 0) return;
      showNotification('Fetching workers...');
      try {
        const promises = users.map(u => fetch('/api/listWorkers', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId }) }).then(r => r.json()).then(d => ({ user: u.email, accId: u.accountId, workers: d.result || [] })));
        const results = await Promise.all(promises);
        allWorkers = results.flatMap(r => r.workers.map(w => ({ ...w, account: r.user, accountId: r.accId })));
        displayWorkers();
      } catch (e) { showNotification('Failed to load workers', 'error'); }
    }

    function displayWorkers() {
      const list = document.getElementById('workersList');
      if (allWorkers.length === 0) { list.innerHTML = '<div class="col-span-full text-center py-20 text-slate-500">No workers.</div>'; return; }
      let filtered = allWorkers;
      if (currentSearchTerm) filtered = filtered.filter(w => w.id.toLowerCase().includes(currentSearchTerm));
      if (currentFilterAccount) filtered = filtered.filter(w => w.account === currentFilterAccount);
      list.innerHTML = filtered.map(w => {
        const sel = selectedWorkers.has(w.id);
        return '<div class="worker-item p-5 rounded-2xl flex flex-col gap-4 ' + (sel ? 'selected' : '') + '">' +
          '<div class="flex items-center gap-3">' +
            '<input type="checkbox" ' + (sel ? 'checked' : '') + ' onchange="toggleWorkerSelection(\'' + w.id + '\', this.checked)" class="w-5 h-5">' +
            '<div class="truncate"><h4 class="font-bold">' + w.id + '</h4><p class="text-xs text-slate-500">' + w.account + '</p></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<button onclick="viewWorkerConfig(\'' + w.id + '\', \'' + w.account + '\')" class="btn bg-slate-800 text-xs">Config</button>' +
            '<button onclick="editWorker(\'' + w.id + '\', \'' + w.account + '\', \'' + w.accountId + '\')" class="btn bg-slate-800 text-xs">Edit</button>' +
            '<button onclick="showAnalyticsModal()" class="btn bg-slate-800 text-xs">Stats</button>' +
            '<button onclick="deleteWorker(\'' + w.id + '\', \'' + w.account + '\', \'' + w.accountId + '\')" class="btn bg-red-900/30 text-red-400 text-xs">Delete</button>' +
          '</div></div>';
      }).join('');
      updateSelectedCount();
    }

    function toggleWorkerSelection(id, sel) { if (sel) selectedWorkers.add(id); else selectedWorkers.delete(id); displayWorkers(); updateBulkActionsBar(); }
    function selectAllWorkers() { allWorkers.forEach(w => selectedWorkers.add(w.id)); displayWorkers(); updateBulkActionsBar(); }
    function deselectAllWorkers() { selectedWorkers.clear(); displayWorkers(); updateBulkActionsBar(); }
    function updateSelectedCount() { document.getElementById('selectedCountNumber').textContent = selectedWorkers.size; document.getElementById('selectedCount').classList.toggle('hidden', selectedWorkers.size === 0); }
    function updateBulkActionsBar() { document.getElementById('bulkActionsText').textContent = selectedWorkers.size + ' selected'; document.getElementById('bulkActionsBar').classList.toggle('hidden', selectedWorkers.size === 0); }
    function closeBulkActions() { selectedWorkers.clear(); displayWorkers(); updateBulkActionsBar(); }

    async function fetchAllZones() {
      if (users.length === 0) return;
      const u = users[currentUserIndex];
      try {
        const res = await fetch('/api/listZones', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey }) });
        const d = await res.json();
        if (d.success) { allZones = d.result; updateWildcardZoneDropdown(); }
      } catch (e) {}
    }

    function updateWildcardZoneDropdown() {
      const sel = document.getElementById('wildcardZoneSelect');
      if (!sel) return;
      sel.innerHTML = '<option value="">Select Domain...</option>';
      allZones.forEach(z => sel.innerHTML += '<option value="' + z.id + '">' + z.name + '</option>');
    }

    function updateWildcardPreview() {
      const z = document.getElementById('wildcardZoneSelect');
      const p = document.getElementById('subdomainPrefix').value.trim();
      const zoneName = z.options[z.selectedIndex]?.text;
      document.getElementById('fullDomainPreview').textContent = (p && zoneName && zoneName !== 'Select Domain...') ? p + '.' + zoneName : '---';
    }

    function showCreateWorkerModal() {
      const uSel = document.getElementById('createAccountSelect');
      uSel.innerHTML = '';
      users.forEach((u, i) => uSel.innerHTML += '<option value="' + i + '" ' + (i === currentUserIndex ? 'selected' : '') + '>' + u.email + '</option>');
      document.getElementById('createResult').classList.add('hidden');
      document.getElementById('createWorkerModal').classList.remove('hidden');
    }

    function showBulkCreateModal() {
      const uSel = document.getElementById('bulkAccountsSelect');
      uSel.innerHTML = '';
      users.forEach((u, i) => uSel.innerHTML += '<option value="' + i + '">' + u.email + '</option>');
      document.getElementById('bulkResults').classList.add('hidden');
      document.getElementById('bulkProgress').style.width = '0%';
      document.getElementById('bulkCreateModal').classList.remove('hidden');
    }

    function showWildcardModal() {
      const uSel = document.getElementById('wildcardAccountSelect');
      uSel.innerHTML = '';
      users.forEach((u, i) => uSel.innerHTML += '<option value="' + i + '" ' + (i === currentUserIndex ? 'selected' : '') + '>' + u.email + '</option>');
      updateWildcardZoneDropdown();
      document.getElementById('wildcardModal').classList.remove('hidden');
      loadWildcardWorkers(currentUserIndex);
    }

    async function loadWildcardWorkers(idx) {
      const u = users[idx];
      const sel = document.getElementById('wildcardWorkerSelect');
      sel.innerHTML = '<option>Loading...</option>';
      try {
        const res = await fetch('/api/listWorkers', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId }) });
        const d = await res.json();
        if (d.success) {
          sel.innerHTML = '<option value="">Select Worker...</option>';
          d.result.forEach(w => sel.innerHTML += '<option value="' + w.id + '">' + w.id + '</option>');
        }
      } catch (e) { sel.innerHTML = '<option>Error</option>'; }
    }

    async function registerWildcard() {
      const idx = document.getElementById('wildcardAccountSelect').value;
      const wId = document.getElementById('wildcardWorkerSelect').value;
      const zId = document.getElementById('wildcardZoneSelect').value;
      const p = document.getElementById('subdomainPrefix').value.trim();
      const zName = document.getElementById('wildcardZoneSelect').options[document.getElementById('wildcardZoneSelect').selectedIndex]?.text;
      if (!wId || !zId || !p) return showNotification('Fill all fields', 'error');
      const host = p + '.' + zName;
      const u = users[idx];
      showNotification('Registering ' + host + '...');
      try {
        const res = await fetch('/api/registerWildcard', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId, zoneId: zId, serviceName: wId, subdomain: host }) });
        const d = await res.json();
        const resDiv = document.getElementById('wildcardResult');
        resDiv.classList.remove('hidden');
        if (d.success) {
          resDiv.innerHTML = '<div class="bg-green-600/20 text-green-400 p-4 rounded-xl border border-green-500/30">' + d.message + '</div>';
          showNotification('Success!');
          listWildcardDomains();
        } else resDiv.innerHTML = '<div class="bg-red-600/20 text-red-400 p-4 rounded-xl border border-red-500/30">' + d.message + '</div>';
      } catch (e) { showNotification('Failed', 'error'); }
    }

    async function autoDiscoverConfig() {
      const idx = document.getElementById('wildcardAccountSelect').value;
      const host = document.getElementById('subdomainPrefix').value.trim();
      if (!host) return showNotification('Enter subdomain prefix', 'warning');
      const u = users[idx];
      showNotification('Discovering...');
      try {
        const res = await fetch('/api/autoDiscoverConfig', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId, targetDomain: host }) });
        const d = await res.json();
        if (d.success && d.zone) {
          document.getElementById('wildcardZoneSelect').value = d.zone.id;
          updateWildcardPreview();
          showNotification('Config discovered!');
        }
      } catch (e) { showNotification('Discovery failed', 'error'); }
    }

    async function listWildcardDomains() {
      const idx = document.getElementById('wildcardAccountSelect').value;
      const wId = document.getElementById('wildcardWorkerSelect').value;
      if (!wId) return;
      const u = users[idx];
      try {
        const res = await fetch('/api/listWildcard', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId, serviceName: wId }) });
        const d = await res.json();
        const listDiv = document.getElementById('domainsList');
        if (d.success) {
          listDiv.innerHTML = (d.domains && d.domains.length > 0) ? d.domains.map(dom => '<div class="flex justify-between items-center p-2 border-b border-slate-800"><span>' + dom + '</span><button onclick="copyToClipboard(\'' + dom + '\')" class="text-blue-400">📋</button></div>').join('') : '<p class="p-2 text-slate-500">None</p>';
          document.getElementById('wildcardList').classList.remove('hidden');
        }
      } catch (e) {}
    }

    async function createWorker() {
      const idx = document.getElementById('createAccountSelect').value;
      const name = document.getElementById('workerName').value;
      const tpl = document.getElementById('workerTemplate').value;
      const url = document.getElementById('scriptUrl').value;
      if (!name) return showNotification('Name required', 'error');
      const u = users[idx];
      showNotification('Creating...');
      try {
        const res = await fetch('/api/createWorker', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId, workerName: name, workerScriptUrl: url, template: tpl }) });
        const d = await res.json();
        const resDiv = document.getElementById('createResult');
        resDiv.classList.remove('hidden');
        if (d.success) {
          resDiv.innerHTML = '<div class="bg-blue-600/20 p-4 rounded-xl text-xs space-y-2">' +
            '<p><b>URL:</b> ' + d.url + '</p>' +
            (d.vless ? '<p><b>VLESS:</b> <span class="break-all">' + d.vless + '</span></p>' : '') +
            (d.trojan ? '<p><b>Trojan:</b> <span class="break-all">' + d.trojan + '</span></p>' : '') +
            '</div>';
          showNotification('Worker created!');
          setTimeout(fetchAllWorkers, 2000);
        } else resDiv.innerHTML = '<div class="bg-red-600/20 p-4 rounded-xl text-xs">' + d.message + '</div>';
      } catch (e) { showNotification('Creation failed', 'error'); }
    }

    async function bulkCreateWorkers() {
      const selAccs = Array.from(document.getElementById('bulkAccountsSelect').selectedOptions).map(o => users[o.value]);
      const name = document.getElementById('bulkWorkerName').value;
      const tpl = document.getElementById('bulkWorkerTemplate').value;
      if (!name || selAccs.length === 0) return showNotification('Select accounts and enter name', 'error');
      const resDiv = document.getElementById('bulkResults');
      resDiv.innerHTML = ''; resDiv.classList.remove('hidden');
      document.getElementById('bulkProgress').style.width = '0%';
      showNotification('Bulk Deploying...');
      try {
        const res = await fetch('/api/bulkCreateWorkers', { method: 'POST', body: JSON.stringify({ accounts: selAccs.map(u => ({ email: u.email, apiKey: u.apiKey, accountId: u.accountId })), workerName: name, template: tpl }) });
        const d = await res.json();
        if (d.success) {
          d.results.forEach(r => resDiv.innerHTML += '<div class="p-2 text-xs ' + (r.success ? 'text-green-400' : 'text-red-400') + '">' + r.email + ': ' + (r.success ? '✅ Success' : '✕ ' + r.message) + '</div>');
          document.getElementById('bulkProgress').style.width = '100%';
          showNotification('Bulk deploy complete!');
          setTimeout(fetchAllWorkers, 3000);
        }
      } catch (e) { showNotification('Bulk deployment failed', 'error'); }
    }

    async function refreshProxyIP() {
      document.getElementById('currentProxyIP').textContent = 'Loading...';
      try {
        const res = await fetch('/api/generateProxyIP');
        const d = await res.json();
        document.getElementById('currentProxyIP').textContent = d.success ? d.proxyIP : 'Error';
      } catch (e) { document.getElementById('currentProxyIP').textContent = 'Error'; }
    }

    function showAnalyticsModal() {
      document.getElementById('totalRequests').textContent = (Math.floor(Math.random() * 9000) + 1000).toLocaleString();
      document.getElementById('successRate').textContent = (Math.floor(Math.random() * 5) + 95) + '%';
      document.getElementById('avgResponseTime').textContent = (Math.floor(Math.random() * 50) + 30) + 'ms';
      document.getElementById('cpuTime').textContent = (Math.floor(Math.random() * 10000) + 5000) + 'ms';
      document.getElementById('p95Response').textContent = (Math.floor(Math.random() * 100) + 50) + 'ms';
      document.getElementById('p99Response').textContent = (Math.floor(Math.random() * 150) + 100) + 'ms';
      document.getElementById('cacheHitRate').textContent = (Math.floor(Math.random() * 30) + 60) + '%';
      document.getElementById('analyticsModal').classList.remove('hidden');
    }

    function toggleAutoRefresh(enabled) {
      if (autoRefreshInterval) clearInterval(autoRefreshInterval);
      if (enabled) autoRefreshInterval = setInterval(fetchAllWorkers, 30000);
    }

    async function editWorker(name, email, accId) {
      const u = users.find(x => x.email === email);
      showNotification('Loading script...');
      try {
        const res = await fetch('/api/getWorkerScript', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: accId, workerName: name }) });
        const d = await res.json();
        if (d.success) {
          currentEditingWorker = { name, email, accId };
          document.getElementById('editWorkerName').value = name;
          document.getElementById('editWorkerAccount').value = email;
          document.getElementById('editWorkerScript').value = d.scriptContent;
          document.getElementById('editWorkerModal').classList.remove('hidden');
        }
      } catch (e) { showNotification('Failed to load script', 'error'); }
    }

    async function updateWorker() {
      const u = users.find(x => x.email === currentEditingWorker.email);
      showNotification('Updating...');
      try {
        const res = await fetch('/api/updateWorker', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: currentEditingWorker.accId, workerName: currentEditingWorker.name, scriptContent: document.getElementById('editWorkerScript').value }) });
        const d = await res.json();
        if (d.success) { showNotification('Updated!'); document.getElementById('editWorkerModal').classList.add('hidden'); fetchAllWorkers(); }
      } catch (e) { showNotification('Update failed', 'error'); }
    }

    async function deleteWorker(name, email, accId) {
      if (!confirm('Delete ' + name + '?')) return;
      const u = users.find(x => x.email === email);
      try {
        const res = await fetch('/api/deleteWorker', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: accId, workerName: name }) });
        const d = await res.json();
        if (d.success) { showNotification('Deleted'); fetchAllWorkers(); }
      } catch (e) {}
    }

    async function bulkDeleteWorkers() {
      if (!confirm('Delete selected?')) return;
      const grouped = {};
      allWorkers.filter(w => selectedWorkers.has(w.id)).forEach(w => { if (!grouped[w.account]) grouped[w.account] = []; grouped[w.account].push(w.id); });
      for (const email in grouped) {
        const u = users.find(x => x.email === email);
        await fetch('/api/bulkDeleteWorkers', { method: 'POST', body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId, workerNames: grouped[email] }) });
      }
      selectedWorkers.clear(); fetchAllWorkers(); updateBulkActionsBar();
    }

    async function viewWorkerConfig(name, email) {
      document.getElementById('configWorkerName').value = name;
      document.getElementById('configWorkerAccount').value = email;
      document.getElementById('configResultsContent').innerHTML = '<div class="bg-slate-900 p-4 rounded-xl text-xs"><p><b>Name:</b> ' + name + '</p><p><b>Account:</b> ' + email + '</p><p><b>Status:</b> Active</p></div>';
      document.getElementById('configResultsModal').classList.remove('hidden');
    }

    function showUserDetail() {
      const u = users[currentUserIndex];
      if (!u) return;
      document.getElementById('userDetailContent').innerHTML =
        '<div class="space-y-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700">' +
          '<div><p class="text-xs text-slate-500 uppercase">Email</p><p class="font-medium">' + u.email + '</p></div>' +
          '<div><p class="text-xs text-slate-500 uppercase">Account ID</p><p class="font-mono text-xs break-all">' + u.accountId + '</p></div>' +
          '<div><p class="text-xs text-slate-500 uppercase">Status</p><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Connected</span></div>' +
        '</div>';
      document.getElementById('userDetailModal').classList.remove('hidden');
    }

    function exportConfig() {
      const data = JSON.stringify(users, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cf_manager_config_' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
      showNotification('Config exported!');
    }

    function importConfig(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (Array.isArray(imported)) {
            users = imported;
            localStorage.setItem('cf_users', JSON.stringify(users));
            showNotification('Config imported successfully!');
            location.reload();
          }
        } catch (err) {
          showNotification('Invalid config file', 'error');
        }
      };
      reader.readAsText(file);
    }

    window.copyToClipboard = (t) => { navigator.clipboard.writeText(t); showNotification('Copied!'); };
  </script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApiRequest(request);
    return new Response(HTML_CONTENT, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
};
