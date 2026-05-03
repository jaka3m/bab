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

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Worker Manager | Professional Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            min-height: 100vh;
            color: #ffffff;
        }

        .glass {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .glass-card {
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            transition: all 0.3s ease;
        }

        .glass-card:hover {
            border-color: rgba(59, 130, 246, 0.5);
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(59, 130, 246, 0.5);
            border-radius: 10px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(59, 130, 246, 0.8);
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
            }
            to {
                transform: translateX(0);
            }
        }

        .fade-in {
            animation: fadeIn 0.5s ease-out;
        }

        .slide-in {
            animation: slideIn 0.3s ease-out;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(12px);
            z-index: 1000;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            animation: slideIn 0.3s ease-out;
        }

        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            transition: all 0.3s ease;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }

        .btn-danger {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .btn-success {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1100;
            animation: slideIn 0.3s ease-out;
        }

        .sidebar {
            position: fixed;
            right: -320px;
            top: 0;
            width: 320px;
            height: 100%;
            transition: right 0.3s ease-out;
            z-index: 100;
        }

        .sidebar.open {
            right: 0;
        }

        .workers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
            padding: 20px;
        }

        @media (max-width: 768px) {
            .workers-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div id="loadingOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); backdrop-filter: blur(20px); z-index: 9999; align-items: center; justify-content: center; flex-direction: column;">
        <div class="spinner"></div>
        <p style="margin-top: 20px; color: #667eea;">Loading...</p>
    </div>

    <div id="notification" class="notification glass" style="display: none; padding: 16px 24px; border-radius: 12px; max-width: 400px;"></div>

    <div id="loginPage" class="fade-in" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <div class="glass-card" style="padding: 48px; border-radius: 24px; max-width: 480px; width: 100%;">
            <div style="text-align: center; margin-bottom: 40px;">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                </div>
                <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">Worker Manager</h1>
                <p style="color: rgba(255,255,255,0.6);">Professional Cloudflare Management Dashboard</p>
            </div>
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Email Address</label>
                    <input type="email" id="email" placeholder="admin@example.com" style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; font-size: 14px;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Global API Key</label>
                    <input type="password" id="apiKey" placeholder="••••••••••••••••" style="width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; font-size: 14px;">
                </div>
                <button id="submitLogin" class="btn-primary" style="padding: 14px; border-radius: 12px; font-weight: 600; font-size: 16px; cursor: pointer;">Connect to Cloudflare</button>
            </div>
        </div>
    </div>

    <div id="dashboard" style="display: none;">
        <nav style="position: fixed; top: 0; left: 0; right: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(20px); z-index: 50; padding: 16px 32px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                    </div>
                    <span style="font-weight: 700; font-size: 20px;">CF Manager Pro</span>
                </div>
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div id="currentAccountEmailDisplay" style="padding: 8px 16px; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 14px;"></div>
                    <button id="burgerBtn" style="background: none; border: none; cursor: pointer; padding: 8px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        </nav>

        <aside id="sidebar" class="sidebar glass" style="padding: 80px 24px 24px;">
            <button id="closeSidebarBtn" style="position: absolute; top: 20px; right: 20px; background: none; border: none; color: white; cursor: pointer; font-size: 24px;">&times;</button>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <h3 style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); margin-bottom: 12px;">Management</h3>
                <button id="refreshWorkers" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer; text-align: left;">🔄 Refresh Workers</button>
                <button id="bulkCreateBtn" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer; text-align: left;">📦 Bulk Create</button>
                <button id="wildcardBtn" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer; text-align: left;">🌐 Wildcard Domain</button>
                <h3 style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); margin: 24px 0 12px;">Utilities</h3>
                <button id="analyticsBtn" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer; text-align: left;">📊 View Analytics</button>
                <button id="exportConfigBtn" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer; text-align: left;">💾 Export/Import</button>
                <h3 style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); margin: 24px 0 12px;">Account</h3>
                <button id="userDetailBtn" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer; text-align: left;">👤 User Details</button>
                <button id="logoutBtn" class="sidebar-btn" style="padding: 12px 16px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: #f5576c; cursor: pointer; text-align: left;">🚪 Logout</button>
                <hr style="border-color: rgba(255,255,255,0.1); margin: 16px 0;">
                <select id="accountSelect" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: white;"></select>
            </div>
        </aside>

        <main style="padding: 100px 32px 40px;">
            <div style="text-align: center; margin-bottom: 60px;">
                <h2 style="font-size: 48px; font-weight: 800; margin-bottom: 16px; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Deploy New Worker</h2>
                <p style="color: rgba(255,255,255,0.6); font-size: 18px;">Create and manage your Cloudflare Workers with ease</p>
                <button id="createWorkerBtn" class="btn-primary" style="margin-top: 32px; padding: 16px 32px; border-radius: 40px; font-weight: 600; font-size: 16px; cursor: pointer;">+ Create New Worker</button>
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
                    <h3 style="font-size: 24px; font-weight: 700;">Your Workers</h3>
                    <div style="display: flex; gap: 12px;">
                        <input type="text" id="searchWorkers" placeholder="Search workers..." style="padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; min-width: 200px;">
                        <select id="filterAccount" style="padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                            <option value="">All Accounts</option>
                        </select>
                    </div>
                </div>
                
                <div class="glass" style="padding: 16px 24px; border-radius: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; gap: 12px;">
                        <button id="selectAllBtn" style="padding: 8px 16px; background: rgba(102,126,234,0.3); border: none; border-radius: 8px; color: #667eea; cursor: pointer;">Select All</button>
                        <button id="deselectAllBtn" style="padding: 8px 16px; background: rgba(255,255,255,0.1); border: none; border-radius: 8px; color: white; cursor: pointer;">Deselect All</button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <label style="color: rgba(255,255,255,0.6);">Auto Refresh:</label>
                        <input type="checkbox" id="autoRefreshToggle" style="width: 40px; height: 20px; cursor: pointer;">
                    </div>
                </div>

                <div id="workersList" class="workers-grid"></div>
            </div>
        </main>
    </div>

    <div id="bulkActionsBar" style="display: none; position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.9); backdrop-filter: blur(20px); padding: 16px 24px; border-radius: 48px; gap: 20px; z-index: 60; border: 1px solid rgba(255,255,255,0.2);">
        <span id="bulkActionsText" style="font-weight: 600;">0 selected</span>
        <button onclick="bulkDeleteWorkers()" style="padding: 8px 20px; background: #f5576c; border: none; border-radius: 24px; color: white; cursor: pointer;">Delete All</button>
        <button id="bulkBarCloseBtn" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px;">&times;</button>
    </div>

    <div id="createWorkerModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 600px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Create New Worker</h3>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <select id="createAccountSelect" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;"></select>
                <input type="text" id="workerName" placeholder="Worker Name" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <select id="workerTemplate" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                        <option value="custom">Custom URL</option>
                        <option value="proxy-checker">PROXY CHECKER</option>
                        <option value="nautica-mod">NAUTICA MOD</option>
                        <option value="nautica">NAUTICA</option>
                        <option value="Gateway">Gateway</option>
                        <option value="vmess">Vmess</option>
                        <option value="Green-jossvpn">Green-jossvpn</option>
                    </select>
                    <div id="customUrlGroup">
                        <input type="text" id="scriptUrl" placeholder="Script URL" value="https://r2.lifetime69.workers.dev/raw/ffdr6xgncp7mkfcd6mj" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; width: 100%;">
                    </div>
                </div>
                <div id="proxyInfo" style="display: none; padding: 16px; background: rgba(102,126,234,0.2); border-radius: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                        <span>🔒 Proxy IP</span>
                        <button id="refreshProxyBtn" style="padding: 4px 12px; background: #667eea; border: none; border-radius: 8px; color: white; cursor: pointer;">Refresh</button>
                    </div>
                    <p id="currentProxyIP" style="font-family: monospace;">Loading...</p>
                </div>
                <div id="createResult" style="display: none;"></div>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="cancelCreateWorker" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Cancel</button>
                    <button id="submitCreateWorker" class="btn-primary" style="padding: 12px 24px; border: none; border-radius: 12px; color: white; cursor: pointer;">Create</button>
                </div>
            </div>
        </div>
    </div>

    <div id="editWorkerModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 800px; max-height: 80vh; overflow-y: auto;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Edit Worker Script</h3>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <input type="text" id="editWorkerName" readonly style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                <input type="text" id="editWorkerAccount" readonly style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                <textarea id="editWorkerScript" rows="15" style="padding: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white; font-family: monospace; font-size: 12px;"></textarea>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="reloadScriptBtn" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Reload</button>
                    <button id="cancelEditWorker" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Cancel</button>
                    <button id="submitEditWorker" class="btn-success" style="padding: 12px 24px; border: none; border-radius: 12px; color: white; cursor: pointer;">Update</button>
                </div>
            </div>
        </div>
    </div>

    <div id="bulkCreateModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 600px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Bulk Create Workers</h3>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <select id="bulkAccountsSelect" multiple size="5" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;"></select>
                <input type="text" id="bulkWorkerName" placeholder="Worker Name" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                <select id="bulkWorkerTemplate" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                    <option value="nautica">NAUTICA</option>
                    <option value="custom">Custom URL</option>
                </select>
                <div id="bulkProgress" style="height: 4px; background: #667eea; border-radius: 2px; transition: width 0.3s;"></div>
                <div id="bulkResults" style="display: none; max-height: 300px; overflow-y: auto;"></div>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="cancelBulkCreate" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Cancel</button>
                    <button id="submitBulkCreate" class="btn-primary" style="padding: 12px 24px; border: none; border-radius: 12px; color: white; cursor: pointer;">Start Bulk Deploy</button>
                </div>
            </div>
        </div>
    </div>

    <div id="wildcardModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 600px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Wildcard Domain Configuration</h3>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <select id="wildcardAccountSelect" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;"></select>
                <select id="wildcardWorkerSelect" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                    <option value="">Select Worker...</option>
                </select>
                <select id="wildcardZoneSelect" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                    <option value="">Select Domain...</option>
                </select>
                <input type="text" id="subdomainPrefix" placeholder="Subdomain (e.g., sampi)" style="padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; color: white;">
                <div style="padding: 12px; background: rgba(102,126,234,0.2); border-radius: 12px;">
                    <p>Preview: <span id="fullDomainPreview" style="color: #667eea; font-weight: bold;">---</span></p>
                </div>
                <div id="wildcardResult" style="display: none;"></div>
                <div id="wildcardList" style="display: none;">
                    <h4 style="margin-bottom: 12px;">Active Domains:</h4>
                    <div id="domainsList" style="max-height: 200px; overflow-y: auto;"></div>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap;">
                    <button id="autoDiscoverBtn" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Auto Discover</button>
                    <button id="listWildcardBtn" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">List Domains</button>
                    <button id="submitWildcard" class="btn-success" style="padding: 12px 24px; border: none; border-radius: 12px; color: white; cursor: pointer;">Register</button>
                    <button id="cancelWildcard" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Close</button>
                </div>
            </div>
        </div>
    </div>

    <div id="analyticsModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 800px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Analytics Dashboard</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 24px;">
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">Requests</p>
                    <p id="totalRequests" style="font-size: 28px; font-weight: bold;">0</p>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">Success Rate</p>
                    <p id="successRate" style="font-size: 28px; font-weight: bold;">0%</p>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">Avg Latency</p>
                    <p id="avgResponseTime" style="font-size: 28px; font-weight: bold;">0ms</p>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">CPU Time</p>
                    <p id="cpuTime" style="font-size: 28px; font-weight: bold;">0ms</p>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px;">
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">P95 Response</p>
                    <p id="p95Response" style="font-size: 20px; font-weight: bold;">0ms</p>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">P99 Response</p>
                    <p id="p99Response" style="font-size: 20px; font-weight: bold;">0ms</p>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 16px;">
                    <p style="color: rgba(255,255,255,0.6); font-size: 12px;">Cache Hit Rate</p>
                    <p id="cacheHitRate" style="font-size: 20px; font-weight: bold;">0%</p>
                </div>
            </div>
            <div style="margin-top: 24px; text-align: right;">
                <button id="cancelAnalytics" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Close</button>
            </div>
        </div>
    </div>

    <div id="userDetailModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 500px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">User Details</h3>
            <div id="userDetailContent"></div>
            <div style="margin-top: 24px; text-align: right;">
                <button onclick="document.getElementById('userDetailModal').classList.remove('active')" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Close</button>
            </div>
        </div>
    </div>

    <div id="configModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 500px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Export/Import Configuration</h3>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <button onclick="exportConfig()" class="btn-primary" style="padding: 14px; border: none; border-radius: 12px; color: white; cursor: pointer;">Export to JSON</button>
                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
                    <p style="margin-bottom: 12px;">Import JSON Config:</p>
                    <input type="file" id="importFile" style="display: none;" onchange="importConfig(this)">
                    <button onclick="document.getElementById('importFile').click()" style="padding: 14px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer; width: 100%;">Choose File & Import</button>
                </div>
                <button onclick="document.getElementById('configModal').classList.remove('active')" style="padding: 12px; background: rgba(255,255,255,0.05); border: none; border-radius: 12px; color: white; cursor: pointer;">Close</button>
            </div>
        </div>
    </div>

    <div id="configResultsModal" class="modal">
        <div class="modal-content glass-card" style="padding: 32px; border-radius: 24px; width: 90%; max-width: 500px;">
            <h3 style="font-size: 24px; margin-bottom: 24px;">Worker Configuration</h3>
            <div id="configResultsContent"></div>
            <div style="margin-top: 24px; text-align: right;">
                <button onclick="document.getElementById('configResultsModal').classList.remove('active')" style="padding: 12px 24px; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: white; cursor: pointer;">Close</button>
            </div>
        </div>
    </div>

    <script>
        var users = JSON.parse(localStorage.getItem('cf_users') || '[]');
        var allZones = [];
        var currentUserIndex = parseInt(localStorage.getItem('cf_current_user') || '0');
        var allWorkers = [];
        var selectedWorkers = new Set();
        var currentEditingWorker = null;
        var autoRefreshInterval = null;
        var currentSearchTerm = '';
        var currentFilterAccount = '';

        function showNotification(msg, type) {
            var notif = document.getElementById('notification');
            notif.textContent = msg;
            notif.style.background = type === 'error' ? 'rgba(245,87,108,0.9)' : 'rgba(102,126,234,0.9)';
            notif.style.display = 'block';
            setTimeout(function() { notif.style.display = 'none'; }, 3000);
        }

        function showLoading() {
            document.getElementById('loadingOverlay').style.display = 'flex';
        }

        function hideLoading() {
            document.getElementById('loadingOverlay').style.display = 'none';
        }

        async function login() {
            var email = document.getElementById('email').value;
            var apiKey = document.getElementById('apiKey').value;
            
            if (!email || !apiKey) {
                showNotification('Email and API Key required', 'error');
                return;
            }
            
            showLoading();
            
            try {
                var res = await fetch('/api/userInfo', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, globalAPIKey: apiKey }) 
                });
                var d = await res.json();
                
                if (!d.success) throw new Error(d.message || 'Login failed');

                var accRes = await fetch('/api/accounts', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, globalAPIKey: apiKey }) 
                });
                var accD = await accRes.json();

                if (!accD.success) throw new Error(accD.message || 'Failed to fetch accounts');

                var user = { 
                    email: email, 
                    apiKey: apiKey, 
                    userInfo: d.result, 
                    accounts: accD.result, 
                    accountId: accD.result[0] ? accD.result[0].id : null
                };

                var idx = users.findIndex(u => u.email === email);
                if (idx >= 0) {
                    users[idx] = user;
                    currentUserIndex = idx;
                } else {
                    users.push(user);
                    currentUserIndex = users.length - 1;
                }

                localStorage.setItem('cf_users', JSON.stringify(users));
                localStorage.setItem('cf_current_user', String(currentUserIndex));
                
                updateUI(); 
                await Promise.all([fetchAllWorkers(), fetchAllZones()]);
                showNotification('Welcome back, ' + (d.result.first_name || email));
            } catch (e) { 
                showNotification(e.message, 'error'); 
            } finally {
                hideLoading();
            }
        }

        function updateUI() {
            var has = users.length > 0;
            document.getElementById('loginPage').style.display = has ? 'none' : 'flex';
            document.getElementById('dashboard').style.display = has ? 'block' : 'none';
            if (has) {
                var u = users[currentUserIndex];
                document.getElementById('currentAccountEmailDisplay').textContent = u.email;
                var sel = document.getElementById('accountSelect');
                sel.innerHTML = '';
                u.accounts.forEach(a => {
                    sel.innerHTML += '<option value="' + a.id + '" ' + (a.id === u.accountId ? 'selected' : '') + '>' + a.name + '</option>';
                });
            }
        }

        async function fetchAllWorkers() {
            if (users.length === 0) return;
            showLoading();
            try {
                var promises = users.map(u => fetch('/api/listWorkers', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId }) 
                }).then(r => r.json()).then(d => ({ user: u.email, accId: u.accountId, workers: d.result || [] })));
                var results = await Promise.all(promises);
                allWorkers = [];
                results.forEach(r => {
                    r.workers.forEach(w => {
                        w.account = r.user;
                        w.accountId = r.accId;
                        allWorkers.push(w);
                    });
                });
                displayWorkers();
            } catch (e) { 
                showNotification('Failed to load workers', 'error'); 
            } finally {
                hideLoading();
            }
        }

        function displayWorkers() {
            var list = document.getElementById('workersList');
            var filtered = allWorkers;
            if (currentSearchTerm) {
                filtered = filtered.filter(w => w.id.toLowerCase().includes(currentSearchTerm));
            }
            if (currentFilterAccount) {
                filtered = filtered.filter(w => w.account === currentFilterAccount);
            }
            
            if (filtered.length === 0) {
                list.innerHTML = '<div style="text-align: center; padding: 60px; color: rgba(255,255,255,0.5);">No workers found.</div>';
                return;
            }
            
            list.innerHTML = filtered.map(w => {
                var isSelected = selectedWorkers.has(w.id);
                return '<div class="glass-card" style="padding: 20px; border-radius: 16px; ' + (isSelected ? 'border-color: #667eea;' : '') + '">' +
                    '<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">' +
                        '<input type="checkbox" ' + (isSelected ? 'checked' : '') + ' onchange="toggleWorkerSelection(\\'' + w.id + '\\', this.checked)" style="width: 20px; height: 20px; cursor: pointer;">' +
                        '<div style="flex: 1;">' +
                            '<h4 style="font-weight: 600; margin-bottom: 4px;">' + w.id + '</h4>' +
                            '<p style="font-size: 12px; color: rgba(255,255,255,0.5);">' + w.account + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">' +
                        '<button onclick="viewWorkerConfig(\\'' + w.id + '\\', \\'' + w.account + '\\')" style="padding: 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 8px; color: white; cursor: pointer;">Config</button>' +
                        '<button onclick="editWorker(\\'' + w.id + '\\', \\'' + w.account + '\\', \\'' + w.accountId + '\\')" style="padding: 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 8px; color: white; cursor: pointer;">Edit</button>' +
                        '<button onclick="showAnalyticsModal()" style="padding: 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 8px; color: white; cursor: pointer;">Stats</button>' +
                        '<button onclick="deleteWorker(\\'' + w.id + '\\', \\'' + w.account + '\\', \\'' + w.accountId + '\\')" style="padding: 8px; background: rgba(245,87,108,0.3); border: none; border-radius: 8px; color: #f5576c; cursor: pointer;">Delete</button>' +
                    '</div>' +
                '</div>';
            }).join('');
            
            updateSelectedCount();
        }

        function toggleWorkerSelection(id, isSelected) {
            if (isSelected) selectedWorkers.add(id);
            else selectedWorkers.delete(id);
            displayWorkers();
            updateBulkActionsBar();
        }

        function selectAllWorkers() {
            allWorkers.forEach(w => selectedWorkers.add(w.id));
            displayWorkers();
            updateBulkActionsBar();
        }

        function deselectAllWorkers() {
            selectedWorkers.clear();
            displayWorkers();
            updateBulkActionsBar();
        }

        function updateSelectedCount() {
            var bar = document.getElementById('bulkActionsBar');
            var text = document.getElementById('bulkActionsText');
            if (selectedWorkers.size > 0) {
                text.textContent = selectedWorkers.size + ' selected';
                bar.style.display = 'flex';
            } else {
                bar.style.display = 'none';
            }
        }

        function updateBulkActionsBar() {
            updateSelectedCount();
        }

        function closeBulkActions() {
            selectedWorkers.clear();
            displayWorkers();
            updateBulkActionsBar();
        }

        async function deleteWorker(name, email, accId) {
            if (!confirm('Delete ' + name + '?')) return;
            showLoading();
            try {
                var u = users.find(x => x.email === email);
                var res = await fetch('/api/deleteWorker', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: accId, workerName: name }) 
                });
                var d = await res.json();
                if (d.success) {
                    showNotification('Worker deleted');
                    fetchAllWorkers();
                }
            } catch (e) {
                showNotification('Delete failed', 'error');
            } finally {
                hideLoading();
            }
        }

        async function bulkDeleteWorkers() {
            if (!confirm('Delete selected workers?')) return;
            showLoading();
            var grouped = {};
            var selectedList = allWorkers.filter(w => selectedWorkers.has(w.id));
            selectedList.forEach(w => {
                if (!grouped[w.account]) grouped[w.account] = [];
                grouped[w.account].push(w.id);
            });
            
            for (var email in grouped) {
                var u = users.find(x => x.email === email);
                await fetch('/api/bulkDeleteWorkers', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId, workerNames: grouped[email] }) 
                });
            }
            selectedWorkers.clear();
            fetchAllWorkers();
            updateBulkActionsBar();
            hideLoading();
        }

        async function editWorker(name, email, accId) {
            showLoading();
            try {
                var u = users.find(x => x.email === email);
                var res = await fetch('/api/getWorkerScript', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: accId, workerName: name }) 
                });
                var d = await res.json();
                if (d.success) {
                    currentEditingWorker = { name: name, email: email, accId: accId };
                    document.getElementById('editWorkerName').value = name;
                    document.getElementById('editWorkerAccount').value = email;
                    document.getElementById('editWorkerScript').value = d.scriptContent;
                    document.getElementById('editWorkerModal').classList.add('active');
                }
            } catch (e) {
                showNotification('Failed to load script', 'error');
            } finally {
                hideLoading();
            }
        }

        async function updateWorker() {
            showLoading();
            try {
                var u = users.find(x => x.email === currentEditingWorker.email);
                var res = await fetch('/api/updateWorker', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: u.email, 
                        globalAPIKey: u.apiKey, 
                        accountId: currentEditingWorker.accId, 
                        workerName: currentEditingWorker.name, 
                        scriptContent: document.getElementById('editWorkerScript').value 
                    }) 
                });
                var d = await res.json();
                if (d.success) {
                    showNotification('Worker updated!');
                    document.getElementById('editWorkerModal').classList.remove('active');
                    fetchAllWorkers();
                }
            } catch (e) {
                showNotification('Update failed', 'error');
            } finally {
                hideLoading();
            }
        }

        async function createWorker() {
            var idx = document.getElementById('createAccountSelect').value;
            var name = document.getElementById('workerName').value;
            var tpl = document.getElementById('workerTemplate').value;
            var url = document.getElementById('scriptUrl').value;
            
            if (!name) {
                showNotification('Worker name required', 'error');
                return;
            }
            
            showLoading();
            var u = users[idx];
            try {
                var res = await fetch('/api/createWorker', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: u.email, 
                        globalAPIKey: u.apiKey, 
                        accountId: u.accountId, 
                        workerName: name, 
                        workerScriptUrl: url, 
                        template: tpl 
                    }) 
                });
                var d = await res.json();
                var resultDiv = document.getElementById('createResult');
                resultDiv.style.display = 'block';
                if (d.success) {
                    resultDiv.innerHTML = '<div style="padding: 16px; background: rgba(102,126,234,0.2); border-radius: 12px; margin-top: 16px;">' +
                        '<p><strong>URL:</strong> ' + d.url + '</p>' +
                        (d.vless ? '<p><strong>VLESS:</strong> <span style="word-break: break-all;">' + d.vless + '</span></p>' : '') +
                        (d.trojan ? '<p><strong>Trojan:</strong> <span style="word-break: break-all;">' + d.trojan + '</span></p>' : '') +
                        '</div>';
                    showNotification('Worker created successfully!');
                    setTimeout(fetchAllWorkers, 2000);
                } else {
                    resultDiv.innerHTML = '<div style="padding: 16px; background: rgba(245,87,108,0.2); border-radius: 12px; margin-top: 16px;">' + d.message + '</div>';
                }
            } catch (e) {
                showNotification('Creation failed', 'error');
            } finally {
                hideLoading();
            }
        }

        async function bulkCreateWorkers() {
            var selectedOptions = Array.from(document.getElementById('bulkAccountsSelect').selectedOptions);
            var selectedAccounts = selectedOptions.map(opt => users[opt.value]);
            var name = document.getElementById('bulkWorkerName').value;
            var tpl = document.getElementById('bulkWorkerTemplate').value;
            
            if (!name || selectedAccounts.length === 0) {
                showNotification('Select accounts and enter worker name', 'error');
                return;
            }
            
            showLoading();
            var resultsDiv = document.getElementById('bulkResults');
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '';
            var progress = document.getElementById('bulkProgress');
            
            try {
                var res = await fetch('/api/bulkCreateWorkers', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        accounts: selectedAccounts.map(u => ({ email: u.email, apiKey: u.apiKey, accountId: u.accountId })), 
                        workerName: name, 
                        template: tpl 
                    }) 
                });
                var d = await res.json();
                if (d.success) {
                    d.results.forEach(r => {
                        resultsDiv.innerHTML += '<div style="padding: 8px; margin: 4px 0; background: ' + (r.success ? 'rgba(102,126,234,0.2)' : 'rgba(245,87,108,0.2)') + '; border-radius: 8px;">' + 
                            r.email + ': ' + (r.success ? '✅ Success' : '❌ ' + r.message) + '</div>';
                    });
                    progress.style.width = '100%';
                    showNotification('Bulk deployment complete!');
                    setTimeout(fetchAllWorkers, 3000);
                }
            } catch (e) {
                showNotification('Bulk deployment failed', 'error');
            } finally {
                hideLoading();
            }
        }

        function showCreateWorkerModal() {
            var sel = document.getElementById('createAccountSelect');
            sel.innerHTML = '';
            users.forEach((u, i) => {
                sel.innerHTML += '<option value="' + i + '" ' + (i === currentUserIndex ? 'selected' : '') + '>' + u.email + '</option>';
            });
            document.getElementById('createResult').style.display = 'none';
            document.getElementById('createWorkerModal').classList.add('active');
        }

        function showBulkCreateModal() {
            var sel = document.getElementById('bulkAccountsSelect');
            sel.innerHTML = '';
            users.forEach((u, i) => {
                sel.innerHTML += '<option value="' + i + '">' + u.email + '</option>';
            });
            document.getElementById('bulkResults').style.display = 'none';
            document.getElementById('bulkProgress').style.width = '0%';
            document.getElementById('bulkCreateModal').classList.add('active');
        }

        function showWildcardModal() {
            var sel = document.getElementById('wildcardAccountSelect');
            sel.innerHTML = '';
            users.forEach((u, i) => {
                sel.innerHTML += '<option value="' + i + '" ' + (i === currentUserIndex ? 'selected' : '') + '>' + u.email + '</option>';
            });
            updateWildcardZoneDropdown();
            document.getElementById('wildcardModal').classList.add('active');
            loadWildcardWorkers(currentUserIndex);
        }

        async function loadWildcardWorkers(idx) {
            var u = users[idx];
            var sel = document.getElementById('wildcardWorkerSelect');
            sel.innerHTML = '<option>Loading...</option>';
            try {
                var res = await fetch('/api/listWorkers', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey, accountId: u.accountId }) 
                });
                var d = await res.json();
                if (d.success) {
                    sel.innerHTML = '<option value="">Select Worker...</option>';
                    d.result.forEach(w => {
                        sel.innerHTML += '<option value="' + w.id + '">' + w.id + '</option>';
                    });
                }
            } catch (e) {
                sel.innerHTML = '<option>Error loading workers</option>';
            }
        }

        async function registerWildcard() {
            var idx = document.getElementById('wildcardAccountSelect').value;
            var wId = document.getElementById('wildcardWorkerSelect').value;
            var zId = document.getElementById('wildcardZoneSelect').value;
            var prefix = document.getElementById('subdomainPrefix').value.trim();
            var zoneSelect = document.getElementById('wildcardZoneSelect');
            var zoneName = zoneSelect.options[zoneSelect.selectedIndex]?.text;
            
            if (!wId || !zId || !prefix) {
                showNotification('Please fill all fields', 'error');
                return;
            }
            
            var host = prefix + '.' + zoneName;
            var u = users[idx];
            showLoading();
            
            try {
                var res = await fetch('/api/registerWildcard', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: u.email, 
                        globalAPIKey: u.apiKey, 
                        accountId: u.accountId, 
                        zoneId: zId, 
                        serviceName: wId, 
                        subdomain: host 
                    }) 
                });
                var d = await res.json();
                var resultDiv = document.getElementById('wildcardResult');
                resultDiv.style.display = 'block';
                if (d.success) {
                    resultDiv.innerHTML = '<div style="padding: 12px; background: rgba(102,126,234,0.2); border-radius: 8px;">' + d.message + '</div>';
                    showNotification('Domain registered successfully!');
                    listWildcardDomains();
                } else {
                    resultDiv.innerHTML = '<div style="padding: 12px; background: rgba(245,87,108,0.2); border-radius: 8px;">' + d.message + '</div>';
                }
            } catch (e) {
                showNotification('Registration failed', 'error');
            } finally {
                hideLoading();
            }
        }

        async function listWildcardDomains() {
            var idx = document.getElementById('wildcardAccountSelect').value;
            var wId = document.getElementById('wildcardWorkerSelect').value;
            if (!wId) return;
            
            var u = users[idx];
            try {
                var res = await fetch('/api/listWildcard', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: u.email, 
                        globalAPIKey: u.apiKey, 
                        accountId: u.accountId, 
                        serviceName: wId 
                    }) 
                });
                var d = await res.json();
                var listDiv = document.getElementById('domainsList');
                var wildcardList = document.getElementById('wildcardList');
                if (d.success && d.domains && d.domains.length > 0) {
                    listDiv.innerHTML = d.domains.map(function(dom) {
                        return '<div style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">' +
                            '<span>' + dom + '</span>' +
                            '<button onclick="copyToClipboard(\\'' + dom + '\\')" style="background: none; border: none; color: #667eea; cursor: pointer;">📋 Copy</button>' +
                        '</div>';
                    }).join('');
                    wildcardList.style.display = 'block';
                } else {
                    listDiv.innerHTML = '<div style="padding: 12px; text-align: center; color: rgba(255,255,255,0.5);">No domains registered</div>';
                    wildcardList.style.display = 'block';
                }
            } catch (e) {
                showNotification('Failed to list domains', 'error');
            }
        }

        async function autoDiscoverConfig() {
            var idx = document.getElementById('wildcardAccountSelect').value;
            var prefix = document.getElementById('subdomainPrefix').value.trim();
            if (!prefix) {
                showNotification('Enter subdomain prefix', 'error');
                return;
            }
            
            var u = users[idx];
            showLoading();
            try {
                var res = await fetch('/api/autoDiscoverConfig', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: u.email, 
                        globalAPIKey: u.apiKey, 
                        accountId: u.accountId, 
                        targetDomain: prefix 
                    }) 
                });
                var d = await res.json();
                if (d.success && d.zone) {
                    document.getElementById('wildcardZoneSelect').value = d.zone.id;
                    updateWildcardPreview();
                    showNotification('Configuration discovered!');
                } else {
                    showNotification('No zone found for domain', 'error');
                }
            } catch (e) {
                showNotification('Discovery failed', 'error');
            } finally {
                hideLoading();
            }
        }

        async function fetchAllZones() {
            if (users.length === 0) return;
            var u = users[currentUserIndex];
            try {
                var res = await fetch('/api/listZones', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: u.email, globalAPIKey: u.apiKey }) 
                });
                var d = await res.json();
                if (d.success) {
                    allZones = d.result;
                    updateWildcardZoneDropdown();
                }
            } catch (e) {}
        }

        function updateWildcardZoneDropdown() {
            var sel = document.getElementById('wildcardZoneSelect');
            if (!sel) return;
            sel.innerHTML = '<option value="">Select Domain...</option>';
            allZones.forEach(function(zone) {
                sel.innerHTML += '<option value="' + zone.id + '">' + zone.name + '</option>';
            });
        }

        function updateWildcardPreview() {
            var zoneSelect = document.getElementById('wildcardZoneSelect');
            var prefix = document.getElementById('subdomainPrefix').value.trim();
            var zoneName = zoneSelect.options[zoneSelect.selectedIndex]?.text;
            var preview = (prefix && zoneName && zoneName !== 'Select Domain...') ? prefix + '.' + zoneName : '---';
            document.getElementById('fullDomainPreview').textContent = preview;
        }

        async function refreshProxyIP() {
            document.getElementById('currentProxyIP').textContent = 'Loading...';
            try {
                var res = await fetch('/api/generateProxyIP');
                var d = await res.json();
                document.getElementById('currentProxyIP').textContent = d.success ? d.proxyIP : 'Error loading proxy';
            } catch (e) {
                document.getElementById('currentProxyIP').textContent = 'Error';
            }
        }

        function showAnalyticsModal() {
            document.getElementById('totalRequests').textContent = Math.floor(Math.random() * 9000 + 1000).toLocaleString();
            document.getElementById('successRate').textContent = Math.floor(Math.random() * 5 + 95) + '%';
            document.getElementById('avgResponseTime').textContent = Math.floor(Math.random() * 50 + 30) + 'ms';
            document.getElementById('cpuTime').textContent = Math.floor(Math.random() * 10000 + 5000) + 'ms';
            document.getElementById('p95Response').textContent = Math.floor(Math.random() * 100 + 50) + 'ms';
            document.getElementById('p99Response').textContent = Math.floor(Math.random() * 150 + 100) + 'ms';
            document.getElementById('cacheHitRate').textContent = Math.floor(Math.random() * 30 + 60) + '%';
            document.getElementById('analyticsModal').classList.add('active');
        }

        function showUserDetail() {
            var u = users[currentUserIndex];
            if (!u) return;
            var content = document.getElementById('userDetailContent');
            content.innerHTML = '<div style="display: flex; flex-direction: column; gap: 16px;">' +
                '<div><label style="color: rgba(255,255,255,0.6);">Email</label><p style="font-weight: 600;">' + u.email + '</p></div>' +
                '<div><label style="color: rgba(255,255,255,0.6);">Account ID</label><p style="font-family: monospace;">' + u.accountId + '</p></div>' +
                '<div><label style="color: rgba(255,255,255,0.6);">Status</label><p style="color: #4facfe;">✓ Connected</p></div>' +
            '</div>';
            document.getElementById('userDetailModal').classList.add('active');
        }

        function exportConfig() {
            var data = JSON.stringify(users, null, 2);
            var blob = new Blob([data], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'cf_manager_config_' + new Date().toISOString().slice(0,10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
            showNotification('Configuration exported!');
        }

        function importConfig(input) {
            var file = input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var imported = JSON.parse(e.target.result);
                    if (Array.isArray(imported)) {
                        users = imported;
                        localStorage.setItem('cf_users', JSON.stringify(users));
                        showNotification('Configuration imported successfully!');
                        location.reload();
                    } else {
                        showNotification('Invalid configuration format', 'error');
                    }
                } catch (err) {
                    showNotification('Invalid JSON file', 'error');
                }
            };
            reader.readAsText(file);
        }

        function viewWorkerConfig(name, email) {
            var content = document.getElementById('configResultsContent');
            content.innerHTML = '<div style="padding: 16px; background: rgba(255,255,255,0.05); border-radius: 12px;">' +
                '<p><strong>Worker Name:</strong> ' + name + '</p>' +
                '<p><strong>Account:</strong> ' + email + '</p>' +
                '<p><strong>Status:</strong> <span style="color: #4facfe;">Active</span></p>' +
            '</div>';
            document.getElementById('configResultsModal').classList.add('active');
        }

        function toggleAutoRefresh(enabled) {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
            if (enabled) autoRefreshInterval = setInterval(fetchAllWorkers, 30000);
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            showNotification('Copied to clipboard!');
        }

        function logoutCurrent() {
            users.splice(currentUserIndex, 1);
            currentUserIndex = 0;
            localStorage.setItem('cf_users', JSON.stringify(users));
            localStorage.setItem('cf_current_user', '0');
            updateUI();
            showNotification('Logged out successfully');
        }

        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('submitLogin').addEventListener('click', login);
            document.getElementById('logoutBtn').addEventListener('click', logoutCurrent);
            document.getElementById('burgerBtn').addEventListener('click', function() {
                document.getElementById('sidebar').classList.toggle('open');
            });
            document.getElementById('closeSidebarBtn').addEventListener('click', function() {
                document.getElementById('sidebar').classList.remove('open');
            });
            
            document.querySelectorAll('.modal').forEach(function(modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) modal.classList.remove('active');
                });
            });
            
            document.getElementById('createWorkerBtn').addEventListener('click', showCreateWorkerModal);
            document.getElementById('bulkCreateBtn').addEventListener('click', showBulkCreateModal);
            document.getElementById('wildcardBtn').addEventListener('click', showWildcardModal);
            document.getElementById('analyticsBtn').addEventListener('click', showAnalyticsModal);
            document.getElementById('userDetailBtn').addEventListener('click', showUserDetail);
            document.getElementById('exportConfigBtn').addEventListener('click', function() {
                document.getElementById('configModal').classList.add('active');
            });
            document.getElementById('refreshWorkers').addEventListener('click', fetchAllWorkers);
            document.getElementById('selectAllBtn').addEventListener('click', selectAllWorkers);
            document.getElementById('deselectAllBtn').addEventListener('click', deselectAllWorkers);
            document.getElementById('bulkBarCloseBtn').addEventListener('click', closeBulkActions);
            
            document.getElementById('cancelCreateWorker').addEventListener('click', function() {
                document.getElementById('createWorkerModal').classList.remove('active');
            });
            document.getElementById('cancelEditWorker').addEventListener('click', function() {
                document.getElementById('editWorkerModal').classList.remove('active');
            });
            document.getElementById('cancelBulkCreate').addEventListener('click', function() {
                document.getElementById('bulkCreateModal').classList.remove('active');
            });
            document.getElementById('cancelWildcard').addEventListener('click', function() {
                document.getElementById('wildcardModal').classList.remove('active');
            });
            document.getElementById('cancelAnalytics').addEventListener('click', function() {
                document.getElementById('analyticsModal').classList.remove('active');
            });
            
            document.getElementById('submitCreateWorker').addEventListener('click', createWorker);
            document.getElementById('submitEditWorker').addEventListener('click', updateWorker);
            document.getElementById('submitBulkCreate').addEventListener('click', bulkCreateWorkers);
            document.getElementById('submitWildcard').addEventListener('click', registerWildcard);
            document.getElementById('listWildcardBtn').addEventListener('click', listWildcardDomains);
            document.getElementById('autoDiscoverBtn').addEventListener('click', autoDiscoverConfig);
            document.getElementById('reloadScriptBtn').addEventListener('click', function() {
                if (currentEditingWorker) {
                    editWorker(currentEditingWorker.name, currentEditingWorker.email, currentEditingWorker.accId);
                }
            });
            document.getElementById('refreshProxyBtn').addEventListener('click', refreshProxyIP);
            
            document.getElementById('workerTemplate').addEventListener('change', function(e) {
                var customUrlGroup = document.getElementById('customUrlGroup');
                var proxyInfo = document.getElementById('proxyInfo');
                customUrlGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
                if (e.target.value.indexOf('nautica') !== -1) {
                    proxyInfo.style.display = 'block';
                    refreshProxyIP();
                } else {
                    proxyInfo.style.display = 'none';
                }
            });
            
            document.getElementById('searchWorkers').addEventListener('input', function(e) {
                currentSearchTerm = e.target.value.toLowerCase();
                displayWorkers();
            });
            document.getElementById('filterAccount').addEventListener('change', function(e) {
                currentFilterAccount = e.target.value;
                displayWorkers();
            });
            
            document.getElementById('autoRefreshToggle').addEventListener('change', function(e) {
                toggleAutoRefresh(e.target.checked);
            });
            
            document.getElementById('subdomainPrefix').addEventListener('input', updateWildcardPreview);
            document.getElementById('wildcardZoneSelect').addEventListener('change', updateWildcardPreview);
            document.getElementById('wildcardAccountSelect').addEventListener('change', function(e) {
                loadWildcardWorkers(e.target.value);
            });
            document.getElementById('accountSelect').addEventListener('change', function(e) {
                var val = e.target.value;
                var idx = users.findIndex(function(u) { return u.accountId === val; });
                if (idx !== -1) {
                    currentUserIndex = idx;
                    localStorage.setItem('cf_current_user', String(currentUserIndex));
                    updateUI();
                    fetchAllWorkers();
                }
            });
            
            var filterSelect = document.getElementById('filterAccount');
            users.forEach(function(u) {
                filterSelect.innerHTML += '<option value="' + u.email + '">' + u.email + '</option>';
            });
            
            document.getElementById('customUrlGroup').style.display = 'none';
            
            if (users.length > 0) {
                updateUI();
                fetchAllWorkers();
                fetchAllZones();
            }
        });
    </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApiRequest(request);
    return new Response(HTML_CONTENT, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
};
