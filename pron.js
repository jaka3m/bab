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

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare Worker Manager | Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #1f2937; }
    ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    .sidebar-transition { transition: transform 0.3s ease-in-out; }
    .sidebar-hidden { transform: translateX(-100%); }
    .burger-btn {
      width: 44px; height: 44px;
      display: flex; flex-direction: column;
      justify-content: center; align-items: center;
      gap: 6px; cursor: pointer;
      transition: all 0.3s ease;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
    }
    .burger-btn span {
      display: block; width: 22px; height: 2px;
      background: white; border-radius: 2px;
      transition: all 0.3s ease;
    }
    .burger-btn.active span:nth-child(1) { transform: translateY(8px) rotate(45deg); }
    .burger-btn.active span:nth-child(2) { opacity: 0; }
    .burger-btn.active span:nth-child(3) { transform: translateY(-8px) rotate(-45deg); }
    .card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
    .modal { animation: fadeIn 0.2s ease-out; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .worker-item { transition: all 0.2s ease; }
    .worker-item.selected { background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.1) 100%); border-left: 3px solid #3b82f6; }
    .notification { animation: slideInRight 0.3s ease-out; }
    @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .dropdown-content { display: none; position: absolute; right: 0; top: 100%; background: #1e293b; min-width: 180px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); border-radius: 8px; z-index: 50; border: 1px solid #334155; }
    .actions-dropdown:hover .dropdown-content { display: block; }
    .tab { transition: all 0.2s ease; }
    .tab.active { border-bottom-color: #3b82f6; color: #3b82f6; }
    .stat-card { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); transition: all 0.2s ease; }
    .stat-card:hover { transform: translateY(-3px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); }
    .nav-btn.active { background: #374151; color: white; }
  </style>
</head>
<body class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-screen">

<div id="notification" class="notification fixed top-5 right-5 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl shadow-lg hidden z-50"></div>

<aside id="sidebar" class="fixed top-0 left-0 h-full w-72 bg-gradient-to-b from-gray-800 to-gray-900 shadow-2xl z-40 sidebar-transition transform -translate-x-full">
  <div class="p-6">
    <div class="flex items-center gap-3 mb-8 pb-4 border-b border-gray-700">
      <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center"><i class="fas fa-cloud text-white text-xl"></i></div>
      <div><h1 class="text-white font-bold text-lg">CF Worker Manager</h1><p class="text-gray-400 text-xs">Cloudflare Dashboard</p></div>
    </div>
    <nav class="space-y-1" id="sidebarNav">
      <div id="sidebarBeforeLogin"><div class="text-gray-400 text-sm py-2 px-3">Silakan login terlebih dahulu</div></div>
      <div id="sidebarAfterLogin" style="display:none;">
        <div class="mb-6 p-3 bg-gray-700/50 rounded-xl">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center"><i class="fas fa-user text-blue-400"></i></div>
            <div><div class="text-white text-sm font-medium" id="sidebarUserEmail">user@example.com</div><div class="text-gray-400 text-xs">Active</div></div>
          </div>
        </div>
        <div class="text-gray-400 text-xs uppercase tracking-wider px-3 py-2">Main Menu</div>
        <button onclick="switchMainView('workers')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="workers"><i class="fas fa-server w-5"></i><span>Workers</span></button>
        <button onclick="switchMainView('create')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="create"><i class="fas fa-plus-circle w-5"></i><span>Create Worker</span></button>
        <button onclick="switchMainView('bulk')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="bulk"><i class="fas fa-layer-group w-5"></i><span>Bulk Create</span></button>
        <button onclick="switchMainView('wildcard')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="wildcard"><i class="fas fa-globe w-5"></i><span>Wildcard Domain</span></button>
        <button onclick="switchMainView('accounts')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="accounts"><i class="fas fa-users w-5"></i><span>Accounts</span></button>
        <div class="text-gray-400 text-xs uppercase tracking-wider px-3 py-2 mt-4">Tools</div>
        <button onclick="switchMainView('analytics')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="analytics"><i class="fas fa-chart-line w-5"></i><span>Analytics</span></button>
        <button onclick="switchMainView('config')" class="nav-btn w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-3" data-nav="config"><i class="fas fa-cog w-5"></i><span>Configuration</span></button>
        <div class="mt-6 pt-4 border-t border-gray-700"><button onclick="logoutAll()" class="w-full text-left px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-3"><i class="fas fa-sign-out-alt w-5"></i><span>Logout All</span></button></div>
      </div>
    </nav>
  </div>
</aside>

<div class="ml-0 transition-all duration-300" id="mainContent">
  <header class="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-30">
    <div class="px-6 py-4 flex justify-end items-center">
      <div class="flex items-center gap-4">
        <div id="accountBadge" class="hidden md:flex items-center gap-2 bg-gray-700 px-3 py-1.5 rounded-full text-sm text-gray-300"><i class="fas fa-user-circle text-blue-400"></i><span id="headerAccountEmail">No account</span></div>
        <button id="burgerBtn" class="burger-btn"><span></span><span></span><span></span></button>
      </div>
    </div>
  </header>

  <div class="container mx-auto px-4 py-6 max-w-7xl">
    <div id="loginSection" class="flex items-center justify-center min-h-[60vh]">
      <div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-gray-700 shadow-xl">
        <div class="text-center mb-8"><div class="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><i class="fas fa-cloud-upload-alt text-white text-3xl"></i></div><h2 class="text-2xl font-bold text-white">Welcome Back</h2><p class="text-gray-400 text-sm mt-1">Login to manage your Cloudflare Workers</p></div>
        <div class="space-y-4">
          <div><label class="block text-gray-300 text-sm mb-2">Email Address</label><input type="email" id="email" placeholder="your-email@example.com" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500"></div>
          <div><label class="block text-gray-300 text-sm mb-2">Global API Key</label><input type="password" id="apiKey" placeholder="Your Cloudflare API Key" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500"></div>
          <button id="submitLogin" class="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 rounded-xl transition-all shadow-lg"><i class="fas fa-sign-in-alt mr-2"></i>Login</button>
        </div>
      </div>
    </div>

    <div id="dashboardSection" style="display:none;">
      <div id="viewWorkers" class="space-y-5">
        <div class="flex flex-wrap justify-between items-center gap-4"><div><h2 class="text-2xl font-bold text-white">Workers</h2><p class="text-gray-400 text-sm">Manage your Cloudflare Workers across all accounts</p></div><div class="flex gap-2"><button id="refreshWorkers" class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl transition flex items-center gap-2"><i class="fas fa-sync-alt"></i> Refresh</button><div class="actions-dropdown relative"><button class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition flex items-center gap-2">Bulk Actions <i class="fas fa-chevron-down ml-1 text-xs"></i></button><div class="dropdown-content"><a onclick="selectAllWorkers()" class="block px-4 py-2 text-gray-300 hover:bg-gray-700 cursor-pointer"><i class="fas fa-check-square mr-2"></i>Select All</a><a onclick="deselectAllWorkers()" class="block px-4 py-2 text-gray-300 hover:bg-gray-700 cursor-pointer"><i class="fas fa-square mr-2"></i>Deselect All</a><hr class="border-gray-700"><a onclick="showBulkActionsModal()" class="block px-4 py-2 text-red-400 hover:bg-gray-700 cursor-pointer"><i class="fas fa-trash-alt mr-2"></i>Delete Selected</a></div></div></div></div>
        <div class="bg-gray-800/30 rounded-xl p-4 border border-gray-700"><div class="flex flex-wrap gap-4"><div class="flex-1 min-w-[200px]"><input type="text" id="searchWorkers" placeholder="Search workers by name..." class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"></div><div class="w-64"><select id="filterAccount" class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"><option value="">All Accounts</option></select></div><button id="clearSearch" class="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition">Clear</button></div></div>
        <div id="workersList" class="space-y-2"></div>
        <div id="selectedCount" class="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hidden z-40">Selected: <span id="selectedCountNumber">0</span> workers</div>
      </div>

      <div id="viewCreate" class="bg-gray-800/30 rounded-2xl p-6 border border-gray-700" style="display:none;"><h2 class="text-2xl font-bold text-white mb-2">Create New Worker</h2><p class="text-gray-400 mb-6">Deploy a new Cloudflare Worker with your chosen template</p><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="space-y-4"><div><label class="block text-gray-300 mb-2">Select Account</label><select id="createAccountSelect" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500"></select></div><div><label class="block text-gray-300 mb-2">Worker Name</label><input type="text" id="workerName" placeholder="my-worker" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500"></div><div><label class="block text-gray-300 mb-2">Template</label><select id="workerTemplate" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500"><option value="custom">Custom URL</option><option value="proxy-checker">PROXY CHECKER</option><option value="nautica-mod">NAUTICA MOD</option><option value="nautica">NAUTICA</option><option value="Gateway">Gateway</option><option value="GatewayMod">Gateway Mod</option><option value="vmess">Vmess</option><option value="vmessMod">Vmess Mod</option><option value="Green-jossvpn">Green-jossvpn</option></select></div><div id="customUrlGroup"><label class="block text-gray-300 mb-2">Script URL <span class="text-gray-500 text-sm">(optional)</span></label><input type="text" id="scriptUrl" value="https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500"></div></div><div><div id="proxyInfo" class="bg-blue-900/30 border border-blue-700 rounded-xl p-4 mb-4" style="display:none;"><div class="flex items-center gap-2 text-blue-400 mb-2"><i class="fas fa-shield-alt"></i><span class="font-semibold">NAUTICA Proxy Information</span></div><p class="text-gray-300 text-sm">Proxy IP: <span id="currentProxyIP" class="font-mono text-blue-300">Loading...</span></p><button type="button" id="refreshProxyBtn" class="mt-2 text-sm text-blue-400 hover:text-blue-300">Refresh</button></div><div id="createResult" class="bg-gray-700/50 rounded-xl p-4" style="display:none;"></div><button id="submitCreateWorker" class="w-full mt-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 rounded-xl transition shadow-lg"><i class="fas fa-plus-circle mr-2"></i>Create Worker</button></div></div></div>

      <div id="viewBulk" class="bg-gray-800/30 rounded-2xl p-6 border border-gray-700" style="display:none;"><h2 class="text-2xl font-bold text-white mb-2">Bulk Create Workers</h2><p class="text-gray-400 mb-6">Deploy workers across multiple Cloudflare accounts</p><div class="space-y-4"><div><label class="block text-gray-300 mb-2">Select Accounts (multiple)</label><select id="bulkAccountsSelect" multiple class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white" style="min-height:150px;"></select><p class="text-gray-500 text-xs mt-1">Hold Ctrl/Cmd to select multiple</p></div><div><label class="block text-gray-300 mb-2">Worker Name</label><input type="text" id="bulkWorkerName" placeholder="my-worker" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"></div><div><label class="block text-gray-300 mb-2">Template</label><select id="bulkWorkerTemplate" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"><option value="custom">Custom URL</option><option value="proxy-checker">PROXY CHECKER</option><option value="nautica-mod">NAUTICA MOD</option><option value="nautica">NAUTICA</option><option value="Gateway">Gateway</option><option value="GatewayMod">GatewayMod</option><option value="vmess">Vmess</option><option value="vmessMod">VmessMod</option><option value="Green-jossvpn">Green-jossvpn</option></select></div><div id="bulkCustomUrlGroup"><label class="block text-gray-300 mb-2">Script URL</label><input type="text" id="bulkScriptUrl" value="https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"></div><div id="bulkProxyInfo" class="bg-blue-900/30 border border-blue-700 rounded-xl p-4" style="display:none;"><div class="flex items-center gap-2 text-blue-400"><i class="fas fa-shield-alt"></i><span class="font-semibold">NAUTICA Proxy Info</span></div><p class="text-gray-300 text-sm mt-1">Setiap worker mendapat proxy IP acak berbeda.</p></div><div class="bg-gray-700/30 rounded-xl p-4"><div class="h-2 bg-gray-700 rounded-full overflow-hidden"><div id="bulkProgress" class="h-full bg-blue-500 transition-all duration-300" style="width:0%"></div></div></div><div id="bulkResults" style="display:none;"></div><button id="submitBulkCreate" class="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-3 rounded-xl transition"><i class="fas fa-play mr-2"></i>Start Bulk Create</button></div></div>

      <div id="viewWildcard" class="bg-gray-800/30 rounded-2xl p-6 border border-gray-700" style="display:none;"><h2 class="text-2xl font-bold text-white mb-2">Wildcard Domain Registration</h2><p class="text-gray-400 mb-6">Register custom domains for your Workers</p><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="space-y-4"><div><label class="block text-gray-300 mb-2">Select Account</label><select id="wildcardAccountSelect" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"></select></div><div><label class="block text-gray-300 mb-2">Select Worker</label><select id="wildcardWorkerSelect" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"><option value="">Select account first</option></select></div><div><label class="block text-gray-300 mb-2">Domain to Register</label><input type="text" id="fullSubdomain" placeholder="subdomain.example.com" class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"></div><div class="flex gap-3"><button id="autoDiscoverBtn" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl transition"><i class="fas fa-search mr-2"></i>Auto Discover</button><button id="submitWildcard" class="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition"><i class="fas fa-check mr-2"></i>Register</button><button id="listWildcardBtn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition"><i class="fas fa-list mr-2"></i>List</button></div></div><div><div id="autoDetectedInfo" class="bg-gray-700/50 rounded-xl p-4 mb-4" style="display:none;"><h4 class="text-blue-400 font-semibold mb-2">Auto-Detected</h4><div class="space-y-1 text-sm"><div class="flex justify-between"><span class="text-gray-400">Zone ID:</span><span id="detectedZoneId" class="text-gray-200 text-xs">-</span></div><div class="flex justify-between"><span class="text-gray-400">Root Domain:</span><span id="detectedRootDomain" class="text-gray-200">-</span></div></div></div><div id="wildcardResult" style="display:none;"></div><div id="wildcardList" class="bg-gray-700/50 rounded-xl p-4 mt-4" style="display:none;"><h4 class="text-gray-300 font-semibold mb-2">Registered Domains</h4><div id="domainsList" class="space-y-2 max-h-60 overflow-y-auto"></div></div></div></div></div>

      <div id="viewAccounts" class="bg-gray-800/30 rounded-2xl p-6 border border-gray-700" style="display:none;"><h2 class="text-2xl font-bold text-white mb-2">Account Management</h2><p class="text-gray-400 mb-6">Manage your connected Cloudflare accounts</p><div id="accountsListContainer" class="space-y-3"></div><div class="mt-6 pt-4 border-t border-gray-700"><h3 class="text-lg font-semibold text-white mb-4">Add New Account</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="email" id="newAccountEmail" placeholder="Email" class="px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"><input type="password" id="newAccountApiKey" placeholder="API Key" class="px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white"><button id="addAccountBtn" class="md:col-span-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"><i class="fas fa-plus mr-2"></i>Add Account</button></div></div></div>

      <div id="viewAnalytics" class="bg-gray-800/30 rounded-2xl p-6 border border-gray-700" style="display:none;"><h2 class="text-2xl font-bold text-white mb-2">Analytics Dashboard</h2><p class="text-gray-400 mb-6">Worker performance statistics</p><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"><div class="stat-card rounded-xl p-4"><div class="text-gray-400 text-sm">Total Requests</div><div class="text-3xl font-bold text-white" id="totalRequests">0</div></div><div class="stat-card rounded-xl p-4"><div class="text-gray-400 text-sm">Success Rate</div><div class="text-3xl font-bold text-green-400" id="successRate">0%</div></div><div class="stat-card rounded-xl p-4"><div class="text-gray-400 text-sm">Avg Response Time</div><div class="text-3xl font-bold text-blue-400" id="avgResponseTime">0ms</div></div><div class="stat-card rounded-xl p-4"><div class="text-gray-400 text-sm">CPU Time</div><div class="text-3xl font-bold text-purple-400" id="cpuTime">0ms</div></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="bg-gray-700/30 rounded-xl p-4"><h3 class="text-white font-semibold mb-3">Performance Metrics</h3><div class="space-y-2"><div class="flex justify-between"><span class="text-gray-400">P95 Response:</span><span id="p95Response" class="text-white">0ms</span></div><div class="flex justify-between"><span class="text-gray-400">P99 Response:</span><span id="p99Response" class="text-white">0ms</span></div><div class="flex justify-between"><span class="text-gray-400">Cache Hit Rate:</span><span id="cacheHitRate" class="text-white">0%</span></div></div></div><div class="bg-gray-700/30 rounded-xl p-4"><h3 class="text-white font-semibold mb-3">Request Distribution</h3><div id="requestDistribution" class="text-gray-400 text-sm">Data based on worker activity</div></div></div></div>

      <div id="viewConfig" class="bg-gray-800/30 rounded-2xl p-6 border border-gray-700" style="display:none;"><h2 class="text-2xl font-bold text-white mb-2">Configuration Management</h2><p class="text-gray-400 mb-6">Export or import your settings</p><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="bg-gray-700/30 rounded-xl p-4"><h3 class="text-white font-semibold mb-3"><i class="fas fa-download text-green-400 mr-2"></i>Export</h3><textarea id="exportData" readonly class="w-full h-64 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white font-mono text-sm"></textarea><div class="flex gap-3 mt-4"><button id="copyExportBtn" class="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-xl">Copy</button><button id="downloadExportBtn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl">Download</button></div></div><div class="bg-gray-700/30 rounded-xl p-4"><h3 class="text-white font-semibold mb-3"><i class="fas fa-upload text-yellow-400 mr-2"></i>Import</h3><textarea id="importData" placeholder="Paste JSON here..." class="w-full h-48 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white font-mono text-sm"></textarea><div class="mt-3"><label class="block text-gray-400 text-sm mb-2">Or upload file:</label><input type="file" id="importFile" accept=".json" class="w-full text-gray-300"></div><button id="submitImportBtn" class="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-xl transition">Import</button></div></div></div>
    </div>
  </div>
</div>

<div id="editWorkerModal" class="modal fixed inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
  <div class="bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4"><div class="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold text-white">Edit Worker Script</h3><button id="cancelEditWorker" class="text-gray-400 hover:text-white text-2xl">&times;</button></div><div class="p-4 space-y-4"><div><label class="block text-gray-300 mb-1">Worker Name</label><input type="text" id="editWorkerName" readonly class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"></div><div><label class="block text-gray-300 mb-1">Account</label><input type="text" id="editWorkerAccount" readonly class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"></div><div><label class="block text-gray-300 mb-1">Script Content</label><textarea id="editWorkerScript" class="w-full h-96 px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white font-mono text-sm"></textarea></div><div class="flex gap-3"><button id="reloadScriptBtn" class="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg">Reload</button><button id="submitEditWorker" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg">Update Worker</button></div></div></div>
</div>

<div id="bulkActionsModal" class="modal fixed inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
  <div class="bg-gray-800 rounded-2xl w-full max-w-lg m-4"><div class="p-4 border-b border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold text-white">Bulk Operations</h3><button id="cancelBulkActions" class="text-gray-400 hover:text-white text-2xl">&times;</button></div><div class="p-4"><p class="text-gray-300 mb-3">Selected: <span id="bulkSelectedCount" class="font-bold text-blue-400">0</span></p><div id="bulkSelectedList" class="max-h-60 overflow-y-auto space-y-2 mb-4"></div><button id="bulkDeleteBtn" class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl"><i class="fas fa-trash-alt mr-2"></i>Delete Selected</button></div></div>
</div>

<div id="configResultsModal" class="modal fixed inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
  <div class="bg-gray-800 rounded-2xl w-full max-w-lg m-4"><div class="p-4 border-b border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold text-white">Worker Config</h3><button id="cancelConfigResults" class="text-gray-400 hover:text-white text-2xl">&times;</button></div><div class="p-4"><div><label class="text-gray-400 text-sm">Worker Name:</label><div id="configWorkerName" class="text-white font-mono"></div></div><div><label class="text-gray-400 text-sm mt-2 block">Account:</label><div id="configWorkerAccount" class="text-white"></div></div><div class="mt-3"><label class="text-gray-400 text-sm">Details:</label><div id="configResultsContent" class="mt-2"></div></div></div></div>
</div>

<div id="userDetailModal" class="modal fixed inset-0 bg-black/80 flex items-center justify-center z-50 hidden">
  <div class="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4"><div class="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center"><h3 class="text-xl font-bold text-white">User Details</h3><button id="cancelUserDetail" class="text-gray-400 hover:text-white text-2xl">&times;</button></div><div class="p-4" id="userDetailContent"></div></div>
</div>

<script>
let users = JSON.parse(localStorage.getItem('cf_users') || '[]');
let currentUserIndex = parseInt(localStorage.getItem('cf_current_user') || '0');
let allWorkers = [];
let selectedWorkers = new Set();
let currentEditingWorker = null;
let currentSearchTerm = '';
let currentFilterAccount = '';
let currentWildcardConfig = null;
let currentMainView = 'workers';

function switchMainView(view) {
  currentMainView = view;
  document.querySelectorAll('#viewWorkers, #viewCreate, #viewBulk, #viewWildcard, #viewAccounts, #viewAnalytics, #viewConfig').forEach(v => v.style.display = 'none');
  let target = document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1));
  if(target) target.style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-gray-700', 'text-white');
    btn.classList.add('text-gray-300');
    if(btn.getAttribute('data-nav') === view) {
      btn.classList.add('bg-gray-700', 'text-white');
      btn.classList.remove('text-gray-300');
    }
  });
  if(view === 'accounts') refreshAccountsList();
  if(view === 'config') refreshExportData();
}

function refreshAccountsList() {
  let container = document.getElementById('accountsListContainer');
  if(!container) return;
  container.innerHTML = users.map((user, idx) => '<div class="bg-gray-700/30 rounded-xl p-4 flex justify-between items-center"><div><div class="text-white font-medium">' + user.email + '</div><div class="text-gray-400 text-sm">' + (user.accountId || 'No account ID') + '</div></div><div class="flex gap-2"><button onclick="switchUser(' + idx + ')" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm">' + (idx === currentUserIndex ? 'Active' : 'Switch') + '</button><button onclick="logoutUser(' + idx + ')" class="bg-red-600/50 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm">Remove</button></div></div>').join('');
}

function refreshExportData() {
  let configData = { users: users.map(u => ({ email: u.email, accountId: u.accountId })), workers: allWorkers.map(w => ({ id: w.id, account: w.account })), export_date: new Date().toISOString(), version: '1.0' };
  document.getElementById('exportData').value = JSON.stringify(configData, null, 2);
}

document.addEventListener('DOMContentLoaded', function() {
  let burgerBtn = document.getElementById('burgerBtn');
  let sidebar = document.getElementById('sidebar');
  let mainContent = document.getElementById('mainContent');
  burgerBtn.addEventListener('click', function() {
    sidebar.classList.toggle('sidebar-hidden');
    burgerBtn.classList.toggle('active');
    mainContent.style.marginLeft = sidebar.classList.contains('sidebar-hidden') ? '0' : '288px';
  });
  setupEventListeners();
  if(users.length > 0) {
    updateUI();
    fetchAllWorkers();
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('sidebarAfterLogin').style.display = 'block';
    document.getElementById('sidebarBeforeLogin').style.display = 'none';
    if(document.getElementById('sidebarUserEmail')) document.getElementById('sidebarUserEmail').innerText = users[currentUserIndex]?.email || 'User';
    switchMainView('workers');
  } else {
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('sidebarAfterLogin').style.display = 'none';
    document.getElementById('sidebarBeforeLogin').style.display = 'block';
  }
});

function setupEventListeners() {
  document.getElementById('submitLogin').addEventListener('click', login);
  document.getElementById('addAccountBtn')?.addEventListener('click', addNewAccount);
  document.getElementById('refreshWorkers').addEventListener('click', fetchAllWorkers);
  document.getElementById('clearSearch').addEventListener('click', function() { document.getElementById('searchWorkers').value = ''; document.getElementById('filterAccount').value = ''; currentSearchTerm = ''; currentFilterAccount = ''; displayWorkers(); });
  document.getElementById('searchWorkers').addEventListener('input', function(e) { currentSearchTerm = e.target.value.toLowerCase(); displayWorkers(); });
  document.getElementById('filterAccount').addEventListener('change', function(e) { currentFilterAccount = e.target.value; displayWorkers(); });
  document.getElementById('submitCreateWorker').addEventListener('click', createWorker);
  document.getElementById('submitBulkCreate').addEventListener('click', bulkCreateWorkers);
  document.getElementById('submitWildcard').addEventListener('click', registerWildcard);
  document.getElementById('listWildcardBtn').addEventListener('click', listWildcardDomains);
  document.getElementById('autoDiscoverBtn').addEventListener('click', autoDiscoverConfig);
  document.getElementById('submitEditWorker').addEventListener('click', updateWorker);
  document.getElementById('reloadScriptBtn').addEventListener('click', reloadWorkerScript);
  document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDeleteWorkers);
  document.getElementById('copyExportBtn').addEventListener('click', copyExportData);
  document.getElementById('downloadExportBtn').addEventListener('click', downloadExportData);
  document.getElementById('submitImportBtn').addEventListener('click', importConfig);
  document.getElementById('importFile').addEventListener('change', handleFileImport);
  document.getElementById('workerTemplate').addEventListener('change', function(e) { document.getElementById('customUrlGroup').style.display = e.target.value === 'custom' ? 'block' : 'none'; updateProxyInfoDisplay(e.target.value); });
  document.getElementById('bulkWorkerTemplate').addEventListener('change', function(e) { document.getElementById('bulkCustomUrlGroup').style.display = e.target.value === 'custom' ? 'block' : 'none'; updateBulkProxyInfoDisplay(e.target.value); });
  document.getElementById('refreshProxyBtn').addEventListener('click', refreshProxyIP);
  document.getElementById('wildcardAccountSelect').addEventListener('change', function() { if(this.value !== '') loadWildcardWorkers(parseInt(this.value)); });
  document.getElementById('cancelEditWorker').addEventListener('click', () => document.getElementById('editWorkerModal').style.display = 'none');
  document.getElementById('cancelBulkActions').addEventListener('click', () => document.getElementById('bulkActionsModal').style.display = 'none');
  document.getElementById('cancelConfigResults').addEventListener('click', () => document.getElementById('configResultsModal').style.display = 'none');
  document.getElementById('cancelUserDetail').addEventListener('click', () => document.getElementById('userDetailModal').style.display = 'none');
}

async function addNewAccount() {
  let email = document.getElementById('newAccountEmail').value, apiKey = document.getElementById('newAccountApiKey').value;
  if(!email || !apiKey) { showNotification('Email and API key required', 'error'); return; }
  try {
    let res = await fetch('/api/userInfo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, globalAPIKey: apiKey }) });
    let result = await res.json();
    if(result.success) {
      let accRes = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, globalAPIKey: apiKey }) });
      let accResult = await accRes.json();
      if(accResult.success) {
        let user = { email, apiKey, userInfo: result.result, accounts: accResult.result, accountId: accResult.result[0]?.id, id: Date.now().toString() };
        let existing = users.findIndex(u => u.email === email);
        if(existing >= 0) users[existing] = user;
        else users.push(user);
        localStorage.setItem('cf_users', JSON.stringify(users));
        localStorage.setItem('cf_current_user', (users.length-1).toString());
        currentUserIndex = users.length - 1;
        updateUI();
        fetchAllWorkers();
        showNotification('Account added!');
        document.getElementById('newAccountEmail').value = '';
        document.getElementById('newAccountApiKey').value = '';
      } else throw new Error('Failed to fetch accounts');
    } else throw new Error('Invalid credentials');
  } catch(e) { showNotification('Error: ' + e.message, 'error'); }
}

async function login() {
  let email = document.getElementById('email').value, apiKey = document.getElementById('apiKey').value;
  if(!email || !apiKey) { showNotification('Email and API key required', 'error'); return; }
  showNotification('Logging in...');
  try {
    let res = await fetch('/api/userInfo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, globalAPIKey: apiKey }) });
    let result = await res.json();
    if(result.success) {
      let accRes = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, globalAPIKey: apiKey }) });
      let accResult = await accRes.json();
      if(accResult.success) {
        let user = { email, apiKey, userInfo: result.result, accounts: accResult.result, accountId: accResult.result[0]?.id, id: Date.now().toString() };
        let existing = users.findIndex(u => u.email === email);
        if(existing >= 0) { users[existing] = user; currentUserIndex = existing; }
        else { users.push(user); currentUserIndex = users.length - 1; }
        localStorage.setItem('cf_users', JSON.stringify(users));
        localStorage.setItem('cf_current_user', currentUserIndex.toString());
        updateUI();
        fetchAllWorkers();
        showNotification('Login successful!');
        document.getElementById('email').value = '';
        document.getElementById('apiKey').value = '';
      } else throw new Error('Failed to fetch accounts');
    } else throw new Error('Invalid credentials');
  } catch(e) { showNotification('Login failed: ' + e.message, 'error'); }
}

function updateUI() {
  let hasUsers = users.length > 0;
  document.getElementById('loginSection').style.display = hasUsers ? 'none' : 'flex';
  document.getElementById('dashboardSection').style.display = hasUsers ? 'block' : 'none';
  document.getElementById('sidebarAfterLogin').style.display = hasUsers ? 'block' : 'none';
  document.getElementById('sidebarBeforeLogin').style.display = hasUsers ? 'none' : 'block';
  if(hasUsers && document.getElementById('sidebarUserEmail')) {
    document.getElementById('sidebarUserEmail').innerText = users[currentUserIndex]?.email || 'User';
    document.getElementById('headerAccountEmail').innerText = users[currentUserIndex]?.email || 'No account';
  }
  let accountSelect = document.getElementById('createAccountSelect');
  if(accountSelect) accountSelect.innerHTML = users.map((u, i) => '<option value="' + i + '">' + u.email + '</option>').join('');
  let bulkSelect = document.getElementById('bulkAccountsSelect');
  if(bulkSelect) { bulkSelect.innerHTML = users.map((u, i) => '<option value="' + i + '">' + u.email + '</option>').join(''); Array.from(bulkSelect.options).forEach(opt => opt.selected = true); }
  let wildcardSelect = document.getElementById('wildcardAccountSelect');
  if(wildcardSelect) wildcardSelect.innerHTML = users.map((u, i) => '<option value="' + i + '">' + u.email + '</option>').join('');
  let filterSelect = document.getElementById('filterAccount');
  if(filterSelect) filterSelect.innerHTML = '<option value="">All Accounts</option>' + users.map(u => '<option value="' + u.email + '">' + u.email + '</option>').join('');
  refreshAccountsList();
}

async function fetchAllWorkers() {
  if(users.length === 0) return;
  showNotification('Fetching workers...');
  try {
    let promises = users.map(u => fetch('/api/listWorkers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId }) }).then(r => r.json()).then(d => ({ user: u.email, accountId: u.accountId, workers: d.result || [] })));
    let results = await Promise.all(promises);
    allWorkers = results.flatMap(r => r.workers.map(w => ({ ...w, account: r.user, accountId: r.accountId })));
    displayWorkers();
    showNotification('Workers loaded');
  } catch(e) { showNotification('Error: ' + e.message, 'error'); }
}

function displayWorkers() {
  let container = document.getElementById('workersList');
  if(allWorkers.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-8">No workers found</div>'; return; }
  let filtered = allWorkers;
  if(currentSearchTerm) filtered = filtered.filter(w => w.id.toLowerCase().includes(currentSearchTerm));
  if(currentFilterAccount) filtered = filtered.filter(w => w.account === currentFilterAccount);
  if(filtered.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-8">No matches</div>'; return; }
  container.innerHTML = filtered.map(w => { let selected = selectedWorkers.has(w.id); return '<div class="worker-item bg-gray-800/50 rounded-xl p-4 flex flex-wrap justify-between items-center gap-3 ' + (selected ? 'selected' : '') + '"><div class="flex items-center gap-3 flex-1 min-w-0"><input type="checkbox" class="w-5 h-5 rounded" ' + (selected ? 'checked' : '') + ' onchange="toggleWorkerSelection(\'' + w.id + '\', this.checked)"><div><div class="text-white font-medium">' + w.id + '</div><div class="text-gray-400 text-sm">Account: ' + w.account + '</div><div class="text-gray-500 text-xs">Created: ' + new Date(w.created_on).toLocaleDateString() + '</div></div></div><div class="actions-dropdown relative"><button class="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm">Actions <i class="fas fa-chevron-down ml-1 text-xs"></i></button><div class="dropdown-content"><a onclick="viewWorkerConfig(\'' + w.id + '\', \'' + w.account + '\')" class="block px-4 py-2 text-gray-300 hover:bg-gray-700 cursor-pointer"><i class="fas fa-eye mr-2"></i>View</a><a onclick="editWorker(\'' + w.id + '\', \'' + w.account + '\', \'' + w.accountId + '\')" class="block px-4 py-2 text-gray-300 hover:bg-gray-700 cursor-pointer"><i class="fas fa-edit mr-2"></i>Edit</a><a onclick="deleteWorker(\'' + w.id + '\', \'' + w.account + '\', \'' + w.accountId + '\')" class="block px-4 py-2 text-red-400 hover:bg-gray-700 cursor-pointer"><i class="fas fa-trash-alt mr-2"></i>Delete</a></div></div></div>'; }).join('');
  let countSpan = document.getElementById('selectedCountNumber');
  let countDiv = document.getElementById('selectedCount');
  if(selectedWorkers.size > 0) { countSpan.innerText = selectedWorkers.size; countDiv.style.display = 'flex'; }
  else countDiv.style.display = 'none';
}

function toggleWorkerSelection(id, selected) { if(selected) selectedWorkers.add(id); else selectedWorkers.delete(id); displayWorkers(); }
function selectAllWorkers() { let filtered = allWorkers; if(currentSearchTerm) filtered = filtered.filter(w => w.id.toLowerCase().includes(currentSearchTerm)); if(currentFilterAccount) filtered = filtered.filter(w => w.account === currentFilterAccount); filtered.forEach(w => selectedWorkers.add(w.id)); displayWorkers(); }
function deselectAllWorkers() { selectedWorkers.clear(); displayWorkers(); }
function showBulkActionsModal() { if(selectedWorkers.size === 0) { showNotification('Select workers first', 'error'); return; } document.getElementById('bulkSelectedCount').innerText = selectedWorkers.size; let details = allWorkers.filter(w => selectedWorkers.has(w.id)); document.getElementById('bulkSelectedList').innerHTML = details.map(w => '<div class="bg-gray-700/50 rounded-lg p-2 text-sm"><strong>' + w.id + '</strong> - ' + w.account + '</div>').join(''); document.getElementById('bulkActionsModal').style.display = 'flex'; }
async function bulkDeleteWorkers() { if(selectedWorkers.size === 0) return; if(!confirm('Delete ' + selectedWorkers.size + ' workers?')) return; showNotification('Deleting...'); let details = allWorkers.filter(w => selectedWorkers.has(w.id)); let groups = {}; details.forEach(w => { if(!groups[w.account]) groups[w.account] = []; groups[w.account].push(w); }); try { for(let email in groups) { let user = users.find(u => u.email === email); if(user) await fetch('/api/bulkDeleteWorkers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: user.accountId, workerNames: groups[email].map(w => w.id) }) }); } showNotification('Deleted'); selectedWorkers.clear(); fetchAllWorkers(); document.getElementById('bulkActionsModal').style.display = 'none'; } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function createWorker() { let accIdx = document.getElementById('createAccountSelect').value, name = document.getElementById('workerName').value, template = document.getElementById('workerTemplate').value, url = document.getElementById('scriptUrl').value; if(!accIdx || !name) { showNotification('Select account and name', 'error'); return; } let user = users[accIdx]; showNotification('Creating...'); try { let res = await fetch('/api/createWorker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, workerName: name, workerScriptUrl: url, accountId: user.accountId, template }) }); let result = await res.json(); let div = document.getElementById('createResult'); div.style.display = 'block'; if(result.success) { let html = '<div class="bg-green-600/20 border border-green-600 rounded-lg p-3 text-green-300">' + result.message + '</div><div class="mt-3 bg-gray-700/50 rounded-lg p-3"><div class="text-gray-300 text-sm">URL:</div><code class="text-blue-400 break-all">' + result.url + '</code>'; if(result.vless) html += '<div class="text-gray-300 text-sm mt-2">VLESS:</div><code class="text-green-400 break-all text-xs">' + result.vless + '</code>'; if(result.trojan) html += '<div class="text-gray-300 text-sm mt-2">Trojan:</div><code class="text-yellow-400 break-all text-xs">' + result.trojan + '</code>'; html += '</div>'; div.innerHTML = html; showNotification('Worker created!'); document.getElementById('workerName').value = ''; setTimeout(() => fetchAllWorkers(), 2000); } else div.innerHTML = '<div class="bg-red-600/20 border border-red-600 rounded-lg p-3 text-red-300">' + result.message + '</div>'; } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function bulkCreateWorkers() { let selected = Array.from(document.getElementById('bulkAccountsSelect').selectedOptions), name = document.getElementById('bulkWorkerName').value, template = document.getElementById('bulkWorkerTemplate').value, url = document.getElementById('bulkScriptUrl').value; if(selected.length === 0 || !name) { showNotification('Select accounts and name', 'error'); return; } let accounts = selected.map(opt => ({ email: users[opt.value].email, apiKey: users[opt.value].apiKey, accountId: users[opt.value].accountId })); showNotification('Starting bulk create...'); try { let res = await fetch('/api/bulkCreateWorkers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts, workerName: name, workerScriptUrl: url, template }) }); let result = await res.json(); let div = document.getElementById('bulkResults'); div.style.display = 'block'; if(result.success) { let successCount = result.results.filter(r => r.success).length; div.innerHTML = '<div class="bg-green-600/20 border border-green-600 rounded-lg p-3 text-green-300">Success on ' + successCount + '/' + result.results.length + ' accounts</div><div class="mt-3 max-h-60 overflow-y-auto space-y-2">' + result.results.map(r => '<div class="bg-gray-700/50 rounded-lg p-2 text-sm"><strong>' + r.email + '</strong>: ' + (r.success ? '✅ Success' : '❌ Failed') + (r.message ? '<br><small>' + r.message + '</small>' : '') + '</div>').join('') + '</div>'; showNotification('Bulk create done!'); setTimeout(() => fetchAllWorkers(), 3000); } } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function editWorker(name, email, accId) { let user = users.find(u => u.email === email); if(!user) { showNotification('User not found', 'error'); return; } showNotification('Loading script...'); try { let res = await fetch('/api/getWorkerScript', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: accId, workerName: name }) }); let result = await res.json(); if(result.success) { currentEditingWorker = { workerName: name, accountEmail: email, accountId: accId }; document.getElementById('editWorkerName').value = name; document.getElementById('editWorkerAccount').value = email; document.getElementById('editWorkerScript').value = result.scriptContent; document.getElementById('editWorkerModal').style.display = 'flex'; } else showNotification('Failed to load', 'error'); } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function updateWorker() { if(!currentEditingWorker) return; let user = users.find(u => u.email === currentEditingWorker.accountEmail); let content = document.getElementById('editWorkerScript').value; try { await fetch('/api/updateWorker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: currentEditingWorker.accountId, workerName: currentEditingWorker.workerName, scriptContent: content }) }); showNotification('Worker updated!'); document.getElementById('editWorkerModal').style.display = 'none'; fetchAllWorkers(); } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function reloadWorkerScript() { if(!currentEditingWorker) return; let user = users.find(u => u.email === currentEditingWorker.accountEmail); try { let res = await fetch('/api/getWorkerScript', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: currentEditingWorker.accountId, workerName: currentEditingWorker.workerName }) }); let result = await res.json(); if(result.success) document.getElementById('editWorkerScript').value = result.scriptContent; } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function deleteWorker(name, email, accId) { if(!confirm('Delete "' + name + '"?')) return; let user = users.find(u => u.email === email); try { await fetch('/api/deleteWorker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: accId, workerName: name }) }); showNotification('Worker deleted'); fetchAllWorkers(); } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
function viewWorkerConfig(name, email) { document.getElementById('configWorkerName').innerText = name; document.getElementById('configWorkerAccount').innerText = email; document.getElementById('configResultsContent').innerHTML = '<div class="bg-gray-700/50 rounded-lg p-3"><div class="text-gray-300">URL: https://' + name + '.workers.dev</div><div class="text-gray-400 text-xs mt-2">Status: Active</div></div>'; document.getElementById('configResultsModal').style.display = 'flex'; }
async function registerWildcard() { let accIdx = document.getElementById('wildcardAccountSelect').value, worker = document.getElementById('wildcardWorkerSelect').value, domain = document.getElementById('fullSubdomain').value.trim(); if(!accIdx || !worker || !domain) { showNotification('Select account, worker, and domain', 'error'); return; } let user = users[accIdx]; try { let res = await fetch('/api/registerWildcard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: user.accountId, serviceName: worker, subdomain: domain, zoneId: currentWildcardConfig?.zoneId || null }) }); let result = await res.json(); let div = document.getElementById('wildcardResult'); div.style.display = 'block'; div.innerHTML = '<div class="' + (result.success ? 'bg-green-600/20 border-green-600 text-green-300' : 'bg-red-600/20 border-red-600 text-red-300') + ' border rounded-lg p-3">' + result.message + '</div>'; if(result.success) showNotification('Domain registered!'); } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function listWildcardDomains() { let accIdx = document.getElementById('wildcardAccountSelect').value, worker = document.getElementById('wildcardWorkerSelect').value; if(!accIdx || !worker) { showNotification('Select account and worker', 'error'); return; } let user = users[accIdx]; try { let res = await fetch('/api/listWildcard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: user.accountId, serviceName: worker }) }); let result = await res.json(); document.getElementById('wildcardList').style.display = 'block'; if(result.success && result.domains?.length) document.getElementById('domainsList').innerHTML = result.domains.map(d => '<div class="bg-gray-700/50 rounded-lg p-2 flex justify-between"><span class="text-gray-200">' + d + '</span><button onclick="copyToClipboard(\'' + d + '\')" class="text-blue-400 text-sm"><i class="fas fa-copy"></i></button></div>').join(''); else document.getElementById('domainsList').innerHTML = '<div class="text-gray-400 text-center py-4">No domains</div>'; } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function autoDiscoverConfig() { let accIdx = document.getElementById('wildcardAccountSelect').value, domain = document.getElementById('fullSubdomain').value; if(!accIdx) { showNotification('Select account', 'error'); return; } let user = users[accIdx]; try { let res = await fetch('/api/autoDiscoverConfig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: user.accountId, targetDomain: domain || user.email.split('@')[1] }) }); let result = await res.json(); if(result.success) { currentWildcardConfig = { accountId: result.accountId, zoneId: result.zone?.id, rootDomain: result.zone?.name }; document.getElementById('detectedZoneId').innerText = result.zone?.id || '-'; document.getElementById('detectedRootDomain').innerText = result.zone?.name || '-'; document.getElementById('autoDetectedInfo').style.display = 'block'; showNotification('Config discovered!'); } else showNotification('Auto-discovery failed', 'error'); } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
async function loadWildcardWorkers(idx) { let user = users[idx], sel = document.getElementById('wildcardWorkerSelect'); if(!user.accountId) { sel.innerHTML = '<option value="">No account ID</option>'; return; } try { let res = await fetch('/api/listWorkers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, globalAPIKey: user.apiKey, accountId: user.accountId }) }); let result = await res.json(); if(result.result?.length) sel.innerHTML = result.result.map(w => '<option value="' + w.id + '">' + w.id + '</option>').join(''); else sel.innerHTML = '<option value="">No workers</option>'; } catch(e) { sel.innerHTML = '<option value="">Error</option>'; } }
function updateProxyInfoDisplay(t) { let el = document.getElementById('proxyInfo'); el.style.display = (t === 'nautica' || t === 'nautica-mod') ? 'block' : 'none'; if(t === 'nautica' || t === 'nautica-mod') refreshProxyIP(); }
function updateBulkProxyInfoDisplay(t) { document.getElementById('bulkProxyInfo').style.display = (t === 'nautica' || t === 'nautica-mod') ? 'block' : 'none'; }
async function refreshProxyIP() { let el = document.getElementById('currentProxyIP'); el.textContent = 'Loading...'; try { let res = await fetch('/api/generateProxyIP'); let result = await res.json(); el.textContent = result.success ? result.proxyIP : 'Error'; } catch(e) { el.textContent = 'Error'; } }
function copyExportData() { let data = document.getElementById('exportData'); data.select(); document.execCommand('copy'); showNotification('Copied!'); }
function downloadExportData() { let data = document.getElementById('exportData').value, blob = new Blob([data], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'cf-config-' + new Date().toISOString().split('T')[0] + '.json'; a.click(); URL.revokeObjectURL(url); showNotification('Downloaded!'); }
function importConfig() { let data = document.getElementById('importData').value; if(!data) { showNotification('Paste configuration data', 'error'); return; } try { let cfg = JSON.parse(data); if(cfg.users && Array.isArray(cfg.users)) { showNotification('Config imported (re-enter API keys)', 'warning'); users = []; localStorage.removeItem('cf_users'); updateUI(); document.getElementById('loginSection').style.display = 'flex'; document.getElementById('dashboardSection').style.display = 'none'; } else throw new Error('Invalid format'); } catch(e) { showNotification('Error: ' + e.message, 'error'); } }
function handleFileImport(e) { let file = e.target.files[0]; if(!file) return; let reader = new FileReader(); reader.onload = ev => document.getElementById('importData').value = ev.target.result; reader.readAsText(file); }
function switchUser(idx) { currentUserIndex = idx; localStorage.setItem('cf_current_user', currentUserIndex); updateUI(); fetchAllWorkers(); showNotification('Switched to ' + users[idx].email); }
function logoutUser(idx) { if(users.length > 1) { users.splice(idx, 1); if(currentUserIndex >= idx && currentUserIndex > 0) currentUserIndex--; localStorage.setItem('cf_users', JSON.stringify(users)); localStorage.setItem('cf_current_user', currentUserIndex); updateUI(); fetchAllWorkers(); showNotification('Account removed'); } else logoutAll(); }
function logoutAll() { users = []; localStorage.removeItem('cf_users'); localStorage.removeItem('cf_current_user'); currentUserIndex = 0; updateUI(); showNotification('Logged out all'); }
function copyToClipboard(t) { navigator.clipboard.writeText(t); showNotification('Copied!'); }
function showNotification(msg, type = 'success') { let n = document.getElementById('notification'); n.textContent = msg; n.className = 'notification fixed top-5 right-5 px-6 py-3 rounded-xl shadow-lg z-50 ' + (type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-gradient-to-r from-green-500 to-green-600') + ' text-white'; n.style.display = 'block'; setTimeout(() => n.style.display = 'none', 4000); }
window.switchUser = switchUser; window.logoutUser = logoutUser; window.copyToClipboard = copyToClipboard; window.toggleWorkerSelection = toggleWorkerSelection; window.selectAllWorkers = selectAllWorkers; window.deselectAllWorkers = deselectAllWorkers; window.showBulkActionsModal = showBulkActionsModal; window.bulkDeleteWorkers = bulkDeleteWorkers; window.deleteWorker = deleteWorker; window.editWorker = editWorker; window.viewWorkerConfig = viewWorkerConfig; window.switchMainView = switchMainView; window.logoutAll = logoutAll;
</script>
</body>
</html>`;

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
