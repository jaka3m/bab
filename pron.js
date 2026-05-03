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
    // Attempt to get script from production environment content endpoint
    const url = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/environments/production/content`;
    const response = await fetch(url, {
      headers: {
        "X-Auth-Email": this.email,
        "X-Auth-Key": this.apiKey
      }
    });

    if (!response.ok) {
      // Fallback to general service content if production environment fetch fails
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
    // 1. Upload script
    await this.updateWorker(accountId, workerName, scriptContent);

    // 2. Enable subdomain
    try {
      await this._fetch(`/accounts/${accountId}/workers/services/${workerName}/environments/production/subdomain`, {
        method: 'POST',
        body: JSON.stringify({ enabled: true })
      });
    } catch (e) {
      console.error("Subdomain activation failed:", e);
    }

    // 3. Get subdomain info
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

    // Serve HTML with Enhanced UI
    const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>✨ Cloudflare Worker Manager Pro ✨</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
  <style>
    :root {
      --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      --glass-bg: rgba(255, 255, 255, 0.08);
      --glass-border: rgba(255, 255, 255, 0.15);
      --neon-glow: 0 0 10px rgba(102, 126, 234, 0.5);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      background-attachment: fixed;
      font-family: 'Poppins', 'Segoe UI', sans-serif;
      min-height: 100vh;
      position: relative;
    }
    
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.1) 0%, transparent 50%),
                  radial-gradient(circle at 80% 80%, rgba(118, 75, 162, 0.1) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }
    
    .navbar-glass {
      background: rgba(15, 20, 40, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(102, 126, 234, 0.3);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      padding: 0.8rem 0;
    }
    
    .navbar-brand {
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(135deg, #fff, #a8b5ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      letter-spacing: 0.5px;
    }
    
    .navbar-brand i {
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    
    .status-badge {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1050;
    }
    
    .status-connected {
      background: linear-gradient(135deg, #00b09b, #96c93d);
      border: none;
      padding: 8px 16px;
      border-radius: 50px;
      font-weight: 500;
      letter-spacing: 0.5px;
      box-shadow: 0 0 15px rgba(0, 176, 155, 0.6);
      animation: blinkGreen 1.5s ease-in-out infinite;
    }
    
    @keyframes blinkGreen {
      0%, 100% {
        opacity: 1;
        box-shadow: 0 0 5px rgba(0, 176, 155, 0.4);
      }
      50% {
        opacity: 0.85;
        box-shadow: 0 0 20px rgba(0, 176, 155, 0.8), 0 0 30px rgba(150, 201, 61, 0.4);
      }
    }
    
    .card-modern {
      background: rgba(15, 25, 45, 0.6);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(102, 126, 234, 0.3);
      border-radius: 20px;
      color: #fff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
    }
    
    .card-modern:hover {
      transform: translateY(-5px);
      border-color: rgba(102, 126, 234, 0.6);
      box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2);
    }
    
    .card-header {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
      border-bottom: 1px solid rgba(102, 126, 234, 0.2);
      padding: 1rem 1.25rem;
      font-weight: 600;
    }
    
    .card-header h5 {
      margin: 0;
      font-size: 1.1rem;
    }
    
    .form-control, .form-select {
      background: rgba(10, 20, 40, 0.8);
      border: 1px solid rgba(102, 126, 234, 0.3);
      color: #fff;
      border-radius: 12px;
      padding: 0.6rem 1rem;
      transition: all 0.3s ease;
    }
    
    .form-control:focus, .form-select:focus {
      background: rgba(10, 20, 40, 0.9);
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
      color: #fff;
    }
    
    .form-control::placeholder {
      color: rgba(255, 255, 255, 0.5);
    }
    
    .btn-gradient {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: white;
      border-radius: 12px;
      padding: 0.6rem 1.5rem;
      font-weight: 500;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    
    .btn-gradient:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
      color: white;
    }
    
    .btn-gradient:active {
      transform: translateY(0);
    }
    
    .btn-outline-info {
      border-color: rgba(102, 126, 234, 0.5);
      color: #a8b5ff;
      border-radius: 12px;
    }
    
    .btn-outline-info:hover {
      background: linear-gradient(135deg, #667eea, #764ba2);
      border-color: transparent;
      color: white;
    }
    
    .worker-item {
      background: rgba(20, 30, 55, 0.6);
      backdrop-filter: blur(5px);
      border: 1px solid rgba(102, 126, 234, 0.2);
      border-radius: 14px;
      transition: all 0.3s ease;
      cursor: pointer;
    }
    
    .worker-item:hover {
      background: rgba(30, 45, 75, 0.8);
      border-color: #667eea;
      transform: translateX(5px);
    }
    
    .worker-url {
      font-size: 0.75rem;
      color: #00b09b;
      word-break: break-all;
    }
    
    .copy-url-btn {
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .copy-url-btn:hover {
      color: #667eea !important;
      transform: scale(1.1);
    }
    
    .editor-container {
      position: relative;
      height: 45vh;
      border-radius: 16px;
      overflow: hidden;
      background: rgba(10, 20, 35, 0.9);
      border: 1px solid rgba(102, 126, 234, 0.3);
    }
    
    #editor, #highlighting {
      margin: 0;
      padding: 15px;
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      tab-size: 2;
      box-sizing: border-box;
      font-family: 'Fira Code', 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 1.6;
      overflow: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    #editor {
      color: transparent;
      background: transparent !important;
      caret-color: #667eea;
      z-index: 1;
      resize: none;
      outline: none;
      -webkit-text-fill-color: transparent;
    }
    
    #highlighting {
      z-index: 0;
      pointer-events: none;
      background: transparent !important;
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
      background: linear-gradient(135deg, #667eea, #764ba2);
      border-radius: 10px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(135deg, #764ba2, #667eea);
    }
    
    .toast-custom {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1050;
      min-width: 300px;
      animation: slideUp 0.3s ease-out;
    }
    
    @keyframes slideUp {
      from {
        transform: translateX(-50%) translateY(100px);
        opacity: 0;
      }
      to {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
    }
    
    .mode-option {
      cursor: pointer;
      transition: all 0.3s ease;
      border: 2px solid rgba(102, 126, 234, 0.3);
      border-radius: 16px;
      background: rgba(20, 30, 55, 0.5);
    }
    
    .mode-option:hover {
      background: rgba(102, 126, 234, 0.2);
      transform: scale(1.02);
      border-color: #667eea;
    }
    
    .mode-option.selected {
      border-color: #00b09b;
      background: linear-gradient(135deg, rgba(0, 176, 155, 0.2), rgba(150, 201, 61, 0.1));
      box-shadow: 0 0 20px rgba(0, 176, 155, 0.3);
    }
    
    .domain-item {
      background: rgba(20, 30, 55, 0.5);
      border-radius: 12px;
      transition: all 0.3s ease;
      border: 1px solid rgba(102, 126, 234, 0.2);
    }
    
    .domain-item:hover {
      transform: translateX(5px);
      background: rgba(30, 45, 75, 0.7);
      border-color: #667eea;
    }
    
    .file-upload-area {
      border: 2px dashed rgba(102, 126, 234, 0.4);
      border-radius: 16px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      background: rgba(20, 30, 55, 0.5);
    }
    
    .file-upload-area:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.1);
    }
    
    .file-upload-area.dragover {
      border-color: #00b09b;
      background: rgba(0, 176, 155, 0.1);
    }
    
    .bulk-actions-bar {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
      border-radius: 14px;
      padding: 12px 16px;
      margin-bottom: 15px;
      border: 1px solid rgba(102, 126, 234, 0.4);
      backdrop-filter: blur(5px);
    }
    
    .offcanvas {
      background: rgba(15, 20, 40, 0.95);
      backdrop-filter: blur(20px);
      border-right: 1px solid rgba(102, 126, 234, 0.3);
    }
    
    .config-modal {
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border: 1px solid rgba(102, 126, 234, 0.3);
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .card-modern {
      animation: fadeIn 0.5s ease-out;
    }
    
    .container {
      position: relative;
      z-index: 1;
    }
    
    .badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: 500;
    }
    
    .text-muted {
      color: rgba(255, 255, 255, 0.6) !important;
    }
    
    .dropdown-menu-dark {
      background: rgba(20, 30, 55, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(102, 126, 234, 0.3);
    }
    
    .dropdown-item {
      color: #e0e0e0;
    }
    
    .dropdown-item:hover {
      background: rgba(102, 126, 234, 0.3);
      color: white;
    }
  </style>
</head>
<body>
  <nav class="navbar navbar-glass fixed-top">
    <div class="container-fluid px-4">
      <div class="d-flex align-items-center gap-3">
        <button class="btn btn-outline-info rounded-circle" style="width: 40px; height: 40px;" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebarCanvas">
          <i class="fas fa-user-astronaut"></i>
        </button>
        <div>
          <span class="navbar-brand mb-0 fs-1">
            <i class="fas fa-cloud-upload-alt me-2"></i>
            CFM
          </span>
          <small class="text-muted d-block" style="font-size: 0.7rem;">Cloudflare Workers Management System</small>
        </div>
      </div>
      <div class="status-badge">
        <div class="badge status-connected" id="statusBadge" style="display: none;">
          <i class="fas fa-plug me-1"></i> 
          <span id="connectionStatus">Connected</span>
          <i class="fas fa-circle ms-1" style="font-size: 8px; color: #00ff00;"></i>
        </div>
      </div>
    </div>
  </nav>

  <div class="offcanvas offcanvas-start" tabindex="-1" id="sidebarCanvas" aria-labelledby="sidebarLabel">
    <div class="offcanvas-header border-bottom" style="border-color: rgba(102, 126, 234, 0.3) !important;">
      <h5 class="offcanvas-title" id="sidebarLabel">
        <i class="fas fa-cloud me-2"></i>Cloudflare Account
      </h5>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
    </div>
    <div class="offcanvas-body">
      <div class="mb-4">
        <label class="form-label text-light fw-bold">📧 Select Account:</label>
        <select id="accSelectorSidebar" class="form-select" onchange="switchAccountSidebar()"></select>
      </div>
      
      <div id="addAccFormSidebar" class="mb-4" style="display: none;">
        <input id="accEmailSidebar" type="email" class="form-control mb-2" placeholder="Email Cloudflare">
        <input id="accKeySidebar" type="password" class="form-control mb-2" placeholder="Global API Key">
        <div class="d-flex gap-2">
          <button onclick="saveAccountSidebar()" class="btn btn-gradient flex-grow-1">
            <i class="fas fa-save me-1"></i> Simpan
          </button>
          <button onclick="toggleAddFormSidebar()" class="btn btn-secondary flex-grow-1">Batal</button>
        </div>
      </div>
      
      <div id="accActionBtnsSidebar">
        <button onclick="toggleAddFormSidebar()" class="btn btn-outline-info w-100 mb-2">
          <i class="fas fa-plus me-2"></i>Tambah Akun Baru
        </button>
        <button onclick="deleteAccountSidebar()" class="btn btn-outline-danger w-100">
          <i class="fas fa-trash-alt me-2"></i>Hapus Akun
        </button>
      </div>
      
      <hr class="my-4" style="border-color: rgba(102, 126, 234, 0.3);">
      
      <div class="text-center">
        <i class="fas fa-shield-alt fa-2x mb-2" style="color: #667eea;"></i>
        <p class="small text-muted">Secure Connection via Cloudflare API</p>
      </div>
    </div>
  </div>

  <div class="container mt-3 pt-3" style="margin-top: 100px !important;">
    <div class="row g-4">
      <div class="col-lg-6">
        <div class="card card-modern mb-4">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="card-title mb-0">
              <i class="fas fa-server me-2 text-info"></i>Worker List
            </h5>
            <button onclick="fetchList()" class="btn btn-sm btn-gradient">
              <i class="fas fa-sync-alt me-1"></i> Refresh
            </button>
          </div>
          <div class="card-body">
            <div id="workerListContainer" class="worker-list-scroll" style="max-height: 400px; overflow-y: auto;"></div>
          </div>
        </div>

        <div class="card card-modern">
          <div class="card-header">
            <h5 class="card-title mb-0">
              <i class="fas fa-globe me-2 text-success"></i>Custom Domain Manager
            </h5>
          </div>
          <div class="card-body">
            <div class="d-flex gap-2 mb-3">
              <select id="customDomainSelect" class="form-select" disabled>
                <option>Pilih Worker terlebih dahulu</option>
              </select>
              <button onclick="loadCustomDomains()" class="btn btn-gradient" id="loadDomainsBtn" disabled>
                <i class="fas fa-sync-alt"></i>
              </button>
            </div>
            <div id="domainList" class="domain-list-scroll mb-3" style="max-height: 250px; overflow-y: auto;"></div>
            
            <div class="btn-group w-100 mb-3" role="group">
              <button type="button" id="modeSingleBtn" class="btn btn-outline-info mode-toggle active" onclick="setMode('single')">
                <i class="fas fa-plus-circle me-1"></i> Single Mode
              </button>
              <button type="button" id="modeMultipleBtn" class="btn btn-outline-info mode-toggle" onclick="setMode('multiple')">
                <i class="fas fa-layer-group me-1"></i> Multiple Mode
              </button>
            </div>
            
            <div id="singleModeForm">
              <div id="addDomainForm" style="display: none;">
                <input type="text" id="newDomain" class="form-control mb-2" placeholder="Contoh: api" />
                <small class="text-muted mb-2 d-block">⚠️ Masukkan subdomain saja (zone akan otomatis ditambahkan)</small>
                <select id="zoneSelect" class="form-select mb-2"></select>
                <div class="d-flex gap-2">
                  <button onclick="attachCustomDomain()" class="btn btn-gradient flex-grow-1">
                    <i class="fas fa-link me-1"></i> Attach Domain
                  </button>
                  <button onclick="toggleAddDomainForm()" class="btn btn-secondary flex-grow-1">Batal</button>
                </div>
              </div>
              <div style="width: fit-content; margin: 0 auto;">
                <button onclick="toggleAddDomainForm()" class="btn btn-gradient" id="showAddBtn">
                  <i class="fas fa-plus-circle me-1"></i> Tambah Custom Domain
                </button>
              </div>
            </div>
            
            <div id="multipleModeForm" style="display: none;">
              <textarea id="multipleDomains" class="form-control mb-2" rows="3" placeholder="Masukkan multiple subdomain&#10;Contoh:&#10;api&#10;cdn&#10;app"></textarea>
              <small class="text-muted mb-2 d-block">✅ Pisahkan dengan baris baru atau koma</small>
              <select id="zoneSelectMultiple" class="form-select mb-2"></select>
              <div class="d-flex gap-2">
                <button onclick="attachMultipleDomains()" class="btn btn-gradient flex-grow-1">
                  <i class="fas fa-layer-group me-1"></i> Attach All
                </button>
                <button onclick="clearMultipleInput()" class="btn btn-secondary flex-grow-1">
                  <i class="fas fa-eraser me-1"></i> Clear
                </button>
              </div>
              <div id="multipleResult" class="mt-3" style="display: none;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="card card-modern">
          <div class="card-header">
            <h5 class="card-title mb-0">
              <i class="fas fa-code me-2 text-warning"></i>Code Editor
            </h5>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <label class="form-label fw-bold mb-3">📋 Select Input Method:</label>
              <div class="row g-3">
                <div class="col-6">
                  <div id="modeImportUrl" class="mode-option p-3 rounded text-center" onclick="selectEditorMode('url')">
                    <i class="fas fa-link fa-2x mb-2" style="color: #667eea;"></i>
                    <div class="fw-bold small">Import from URL</div>
                    <small class="text-muted">GitHub/Raw</small>
                  </div>
                </div>
                <div class="col-6">
                  <div id="modeImportFile" class="mode-option p-3 rounded text-center" onclick="selectEditorMode('file')">
                    <i class="fas fa-file-upload fa-2x mb-2" style="color: #667eea;"></i>
                    <div class="fw-bold small">Upload File</div>
                    <small class="text-muted">From Computer</small>
                  </div>
                </div>
                <div class="col-6">
                  <div id="modeManual" class="mode-option p-3 rounded text-center" onclick="selectEditorMode('manual')">
                    <i class="fas fa-edit fa-2x mb-2" style="color: #667eea;"></i>
                    <div class="fw-bold small">Manual Edit</div>
                    <small class="text-muted">Write Code</small>
                  </div>
                </div>
                <div class="col-6">
                  <div id="modeUpdate" class="mode-option p-3 rounded text-center" onclick="selectEditorMode('update')">
                    <i class="fas fa-sync-alt fa-2x mb-2" style="color: #667eea;"></i>
                    <div class="fw-bold small">Update Worker</div>
                    <small class="text-muted">From Existing</small>
                  </div>
                </div>
              </div>
            </div>

            <div id="editorPanel" style="display: none;">
              <div id="panelImportUrl" class="editor-mode-card mb-3" style="display: none;">
                <label class="form-label">🔗 Worker Code URL:</label>
                <div class="input-group">
                  <input type="text" id="githubUrl" class="form-control" placeholder="https://raw.githubusercontent.com/.../worker.js" />
                  <button onclick="importFromUrl()" class="btn btn-gradient">
                    <i class="fas fa-download me-1"></i> Import
                  </button>
                </div>
                <div class="import-examples mt-2 small">
                  <span class="text-muted">📌 Examples:</span>
                  <span onclick="setExampleUrl('https://raw.githubusercontent.com/example/worker.js')" class="text-info" style="cursor: pointer;">GitHub Raw</span>
                </div>
              </div>

              <div id="panelImportFile" class="editor-mode-card mb-3" style="display: none;">
                <label class="form-label">📁 Select File:</label>
                <div id="fileUploadArea" class="file-upload-area" onclick="document.getElementById('fileInput').click()" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleFileDrop(event)">
                  <i class="fas fa-cloud-upload-alt fa-2x mb-2"></i>
                  <p class="mb-1">Click or drag & drop file here</p>
                  <small class="text-muted">Support: .js, .txt, .mjs</small>
                  <input type="file" id="fileInput" style="display: none;" accept=".js,.txt,.mjs,.cjs" onchange="handleFileSelect(event)" />
                </div>
              </div>

              <div id="panelManual" class="editor-mode-card mb-3" style="display: none;">
                <div class="alert alert-info bg-info bg-opacity-10 border-info text-white small">
                  <i class="fas fa-info-circle me-1"></i> Edit worker code directly in the editor below
                </div>
              </div>

              <div id="panelUpdate" class="editor-mode-card mb-3" style="display: none;">
                <label class="form-label">📋 Select Worker to Update:</label>
                <div class="d-flex gap-2 mb-2">
                  <select id="updateWorkerSelect" class="form-select flex-grow-1">
                    <option value="">Pilih Worker...</option>
                  </select>
                  <button onclick="loadWorkerToEditor()" class="btn btn-gradient">
                    <i class="fas fa-folder-open me-1"></i> Load
                  </button>
                </div>
                <div class="d-flex gap-2">
                  <button onclick="copyCodeToClipboard()" class="btn btn-outline-info flex-grow-1" id="copyCodeBtn" disabled>
                    <i class="fas fa-copy me-1"></i> Copy
                  </button>
                  <button onclick="downloadCode()" class="btn btn-outline-info flex-grow-1" id="downloadCodeBtn" disabled>
                    <i class="fas fa-download me-1"></i> Download
                  </button>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label fw-bold">✏️ Worker Name:</label>
                <input type="text" id="newWorkerName" class="form-control" placeholder="contoh: my-worker" />
                <small class="text-muted">* Isi untuk deploy baru, kosongkan jika update worker yang dipilih</small>
              </div>

              <div class="editor-container">
                <textarea id="editor" spellcheck="false" oninput="updateView(); syncScroll();" onscroll="syncScroll();"></textarea>
                <pre id="highlighting" aria-hidden="true"><code class="language-javascript" id="highlighting-content"></code></pre>
              </div>

              <div class="d-flex gap-2 mt-3">
                <button onclick="deployWorker()" class="btn btn-gradient w-100">
                  <i class="fas fa-cloud-upload-alt me-2"></i> DEPLOY / UPDATE WORKER
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="toast-custom" id="toastNotification" style="display: none; z-index: 9999;">
    <div class="toast show bg-dark bg-opacity-90 text-white border-secondary d-inline-block w-auto" role="alert">
      <div class="toast-header bg-dark text-white border-bottom-0" id="toastHeader">
        <i class="fas fa-bell me-2"></i>
        <strong class="me-auto">Notification</strong>
        <button type="button" class="btn-close btn-close-white" onclick="hideToast()"></button>
      </div>
      <div class="toast-body" id="toastMessage"></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
  
  <script>
    const $ = id => document.getElementById(id);
    let accounts = JSON.parse(localStorage.getItem('cf_accounts_v2') || '[]');
    let currentAcc = null;
    let workersList = [];
    let currentWorkerDomains = [];
    let availableZones = [];
    let toastTimeout;
    let currentMode = 'single';
    let currentEditorMode = null;
    let currentLoadedWorkerName = null;
    let selectedWorkers = new Set();

    function showToast(message, isError = false) {
      const toast = $('toastNotification');
      const header = $('toastHeader');
      const msgElement = $('toastMessage');
      
      if (toastTimeout) clearTimeout(toastTimeout);
      
      if (isError) {
        header.innerHTML = \`
          <i class="fas fa-exclamation-triangle me-2 text-danger"></i>
          <strong class="me-auto text-danger">Error</strong>
          <button type="button" class="btn-close btn-close-white" onclick="hideToast()"></button>
        \`;
      } else {
        header.innerHTML = \`
          <i class="fas fa-check-circle me-2 text-success"></i>
          <strong class="me-auto text-success">Success</strong>
          <button type="button" class="btn-close btn-close-white" onclick="hideToast()"></button>
        \`;
      }
      
      msgElement.textContent = message;
      toast.style.display = 'block';
      
      toastTimeout = setTimeout(() => hideToast(), 5000);
    }
    
    function hideToast() {
      const toast = $('toastNotification');
      toast.style.display = 'none';
      if (toastTimeout) clearTimeout(toastTimeout);
    }

    function notify(msg, err = false) {
      showToast(msg, err);
    }
    
    async function copyToClipboard(text, successMsg) {
      try {
        await navigator.clipboard.writeText(text);
        notify(successMsg || \`✅ URL berhasil dicopy: \${text}\`);
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        notify(successMsg || \`✅ URL berhasil dicopy: \${text}\`);
      }
    }

    function updateSelectionUI() {
      const selectionBar = document.getElementById('selectionBar');
      const selectedCount = selectedWorkers.size;
      
      if (selectedCount > 0) {
        if (!selectionBar) {
          const bar = document.createElement('div');
          bar.id = 'selectionBar';
          bar.className = 'bulk-actions-bar d-flex justify-content-between align-items-center';
          bar.innerHTML = \`
            <div>
              <input type="checkbox" id="selectAllCheckbox" class="select-all-checkbox me-2" onchange="toggleSelectAll()">
              <label class="small">Select All</label>
            </div>
            <div>
              <span class="me-3"><strong id="selectedCountDisplay">\${selectedCount}</strong> selected</span>
              <button class="btn btn-sm btn-danger" onclick="bulkDeleteWorkers()">
                <i class="fas fa-trash-alt me-1"></i> Delete Selected
              </button>
              <button class="btn btn-sm btn-secondary ms-2" onclick="clearSelection()">
                <i class="fas fa-times me-1"></i> Close
              </button>
            </div>
          \`;
          const container = $('workerListContainer');
          container.parentNode.insertBefore(bar, container);
        } else {
          const countDisplay = document.getElementById('selectedCountDisplay');
          if (countDisplay) countDisplay.innerText = selectedCount;
          const selectAllCheckbox = document.getElementById('selectAllCheckbox');
          if (selectAllCheckbox) {
            selectAllCheckbox.checked = (selectedCount === workersList.length && workersList.length > 0);
          }
        }
      } else {
        if (selectionBar) selectionBar.remove();
      }
    }
    
    function toggleSelectAll() {
      const selectAllCheckbox = document.getElementById('selectAllCheckbox');
      if (selectAllCheckbox.checked) {
        workersList.forEach(w => selectedWorkers.add(w.id));
      } else {
        selectedWorkers.clear();
      }
      updateSelectionUI();
      renderWorkerList();
    }
    
    function toggleWorkerSelection(workerId, checked) {
      if (checked) {
        selectedWorkers.add(workerId);
      } else {
        selectedWorkers.delete(workerId);
      }
      updateSelectionUI();
      renderWorkerList();
    }
    
    function clearSelection() {
      selectedWorkers.clear();
      updateSelectionUI();
      renderWorkerList();
    }
    
    async function bulkDeleteWorkers() {
      if (selectedWorkers.size === 0) {
        notify("Tidak ada worker yang dipilih!", true);
        return;
      }
      
      const workerNames = Array.from(selectedWorkers);
      if (!confirm(\`Yakin ingin menghapus \${workerNames.length} worker?\\n\\n\${workerNames.join('\\n')}\`)) return;
      
      notify(\`Menghapus \${workerNames.length} worker...\`);
      
      try {
        const res = await fetch('/api/delete-bulk', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAcc.email,
            'X-Auth-Key': currentAcc.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ names: workerNames })
        });
        const result = await res.json();
        
        if (result.success) {
          let message = \`✅ Selesai! \${result.successCount} dari \${result.total} worker berhasil dihapus.\`;
          if (result.failedCount > 0) {
            const failed = result.results.filter(r => !r.success).map(r => r.name).join(', ');
            message += \`\\n❌ Gagal: \${failed}\`;
          }
          notify(message, result.failedCount > 0);
          selectedWorkers.clear();
          fetchList();
        } else {
          throw new Error(result.error || "Gagal menghapus worker");
        }
      } catch(e) {
        notify("❌ Gagal: " + e.message, true);
      }
    }
    
    function renderWorkerList() {
      if (workersList.length === 0) {
        $('workerListContainer').innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-inbox fa-2x mb-2 d-block"></i>Belum ada worker</div>';
        return;
      }
      
      $('workerListContainer').innerHTML = workersList.map(w => {
        const workerUrl = w.url || \`https://\${w.id}.workers.dev\`;
        return \`
          <div class="worker-item p-3 mb-2">
            <div class="d-flex align-items-start">
              <input type="checkbox" class="worker-checkbox me-3 mt-1" 
                     data-worker-id="\${w.id}"
                     \${selectedWorkers.has(w.id) ? 'checked' : ''}
                     onchange="toggleWorkerSelection('\${w.id}', this.checked)">
              <div class="flex-grow-1">
                <div class="fw-bold">
                  <i class="fas fa-code text-info me-2"></i>\${w.id}
                </div>
                <div class="worker-url mt-1">
                  <i class="fas fa-link me-1" style="font-size: 10px;"></i>
                  <span id="url-\${w.id}">\${workerUrl}</span>
                  <i class="fas fa-copy ms-2 copy-url-btn text-info" style="font-size: 12px; cursor: pointer;" 
                     onclick="event.stopPropagation(); copyToClipboard('\${workerUrl}', '✅ URL \${w.id} berhasil dicopy!')"></i>
                </div>
                <div class="small text-muted mt-1">
                  <i class="fas fa-envelope me-1"></i>\${currentAcc.email}
                </div>
              </div>
              <div class="dropdown">
                <button class="btn btn-sm btn-outline-info rounded-circle" style="width: 32px; height: 32px;" type="button" data-bs-toggle="dropdown">
                  <i class="fas fa-ellipsis-v"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-dark">
                  <li><a class="dropdown-item" href="#" onclick="viewConfig('\${w.id}')">
                    <i class="fas fa-eye me-2"></i> View Config
                  </a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item text-danger" href="#" onclick="deleteSingleWorker('\${w.id}')">
                    <i class="fas fa-trash me-2"></i> Delete
                  </a></li>
                </ul>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }
    
    async function deleteSingleWorker(workerName) {
      if (!confirm(\`Yakin ingin menghapus worker "\${workerName}"?\`)) return;
      
      notify(\`Menghapus \${workerName}...\`);
      try {
        const res = await fetch('/api/delete', {
          method: 'DELETE',
          headers: {
            'X-Auth-Email': currentAcc.email,
            'X-Auth-Key': currentAcc.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: workerName })
        });
        const d = await res.json();
        if (d.success) {
          notify(\`✅ Worker "\${workerName}" berhasil dihapus!\`);
          selectedWorkers.delete(workerName);
          fetchList();
          $('customDomainSelect').innerHTML = '<option value="">Pilih Worker</option>';
          $('domainList').innerHTML = '';
          $('updateWorkerSelect').innerHTML = '<option value="">Pilih Worker...</option>';
          if (currentLoadedWorkerName === workerName) {
            enableCopyDownloadButtons(false);
            currentLoadedWorkerName = null;
          }
        } else {
          notify("❌ Gagal hapus: " + (d.errors?.[0]?.message || "Unknown error"), true);
        }
      } catch(e) {
        notify("❌ Error: " + e.message, true);
      }
    }

    async function viewConfig(workerName) {
      if (!currentAcc) {
        notify("Pilih akun terlebih dahulu!", true);
        return;
      }
      
      notify(\`Mengambil konfigurasi \${workerName}...\`);
      
      try {
        const res = await fetch('/api/get?name=' + encodeURIComponent(workerName), {
          headers: { 'X-Auth-Email': currentAcc.email, 'X-Auth-Key': currentAcc.key }
        });
        const d = await res.json();
        
        if (d.success) {
          const code = d.code;
          const codeLength = code.length;
          const lines = code.split('\\n').length;
          const workerUrl = d.url || \`https://\${workerName}.workers.dev\`;
          
          let workerType = 'Standard Worker';
          let features = [];
          
          if (code.includes('export default') && code.includes('fetch')) {
            workerType = 'ES Modules Worker';
            features.push('ES Modules');
          }
          if (code.includes('addEventListener') && code.includes('fetch')) {
            workerType = 'Service Worker';
            features.push('Service Worker API');
          }
          if (code.includes('await fetch') || code.includes('.fetch(')) {
            features.push('HTTP Requests');
          }
          if (code.includes('caches') || code.includes('CacheStorage')) {
            features.push('Cache API');
          }
          if (code.includes('KVNamespace') || (code.includes('.get(') && code.includes('.put('))) {
            features.push('KV Storage');
          }
          if (code.includes('HTMLRewriter')) {
            features.push('HTML Rewriter');
          }
          if (code.includes('WebSocket')) {
            features.push('WebSocket');
          }
          
          const modalHtml = \`
            <div class="modal fade" id="configModal" tabindex="-1" style="z-index: 1060;">
              <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content config-modal text-white">
                  <div class="modal-header border-secondary">
                    <h5 class="modal-title">
                      <i class="fas fa-cog text-primary"></i> Worker Configuration
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body">
                    <div class="mb-4">
                      <h6 class="text-info mb-3"><i class="fas fa-info-circle"></i> Worker Information</h6>
                      <div class="row">
                        <div class="col-md-6 mb-2">
                          <div class="text-muted small">Worker Name</div>
                          <div><code>\${workerName}</code></div>
                        </div>
                        <div class="col-md-6 mb-2">
                          <div class="text-muted small">Account</div>
                          <div>\${currentAcc.email}</div>
                        </div>
                        <div class="col-md-6 mb-2">
                          <div class="text-muted small">Worker URL</div>
                          <div>
                            <code class="text-success">\${workerUrl}</code>
                            <i class="fas fa-copy ms-2 copy-url-btn" style="cursor: pointer;" 
                               onclick="copyToClipboard('\${workerUrl}', '✅ Worker URL berhasil dicopy!')"></i>
                          </div>
                        </div>
                        <div class="col-md-6 mb-2">
                          <div class="text-muted small">Status</div>
                          <div><span class="badge bg-success">Active</span></div>
                        </div>
                      </div>
                    </div>
                    
                    <div class="mb-4">
                      <h6 class="text-info mb-3"><i class="fas fa-code"></i> Code Statistics</h6>
                      <div class="row">
                        <div class="col-md-4 mb-2">
                          <div class="text-muted small">File Size</div>
                          <div>\${(codeLength / 1024).toFixed(2)} KB</div>
                        </div>
                        <div class="col-md-4 mb-2">
                          <div class="text-muted small">Lines of Code</div>
                          <div>\${lines}</div>
                        </div>
                        <div class="col-md-4 mb-2">
                          <div class="text-muted small">Worker Type</div>
                          <div><span class="badge bg-info">\${workerType}</span></div>
                        </div>
                      </div>
                    </div>
                    
                    <div class="mb-4">
                      <h6 class="text-info mb-3"><i class="fas fa-puzzle-piece"></i> Features Detected</h6>
                      <div>
                        \${features.length > 0 ? features.map(f => \`<span class="badge bg-secondary me-2 mb-2">\${f}</span>\`).join('') : '<span class="text-muted">No specific features detected</span>'}
                      </div>
                    </div>
                    
                    <div>
                      <h6 class="text-info mb-3"><i class="fas fa-link"></i> Custom Domains</h6>
                      <div id="configDomainsList" class="small">
                        <span class="text-muted">Loading domains...</span>
                      </div>
                    </div>
                  </div>
                  <div class="modal-footer border-secondary">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                  </div>
                </div>
              </div>
            </div>
          \`;
          
          const existingModal = document.getElementById('configModal');
          if (existingModal) existingModal.remove();
          
          document.body.insertAdjacentHTML('beforeend', modalHtml);
          
          loadDomainsForConfig(workerName);
          
          const modal = new bootstrap.Modal(document.getElementById('configModal'));
          modal.show();
          
          document.getElementById('configModal').addEventListener('hidden.bs.modal', function() {
            this.remove();
          });
        } else {
          throw new Error(d.errors?.[0]?.message || "Gagal ambil konfigurasi");
        }
      } catch(e) {
        notify("❌ Gagal: " + e.message, true);
      }
    }
    
    async function loadDomainsForConfig(workerName) {
      try {
        const res = await fetch('/api/get-custom-domains?name=' + encodeURIComponent(workerName), {
          headers: { 'X-Auth-Email': currentAcc.email, 'X-Auth-Key': currentAcc.key }
        });
        const data = await res.json();
        const container = document.getElementById('configDomainsList');
        if (container) {
          if (data.success && data.customDomains && data.customDomains.length > 0) {
            container.innerHTML = data.customDomains.map(d => 
              \`<div class="mb-1"><i class="fas fa-globe text-success me-2"></i>\${d.hostname}</div>\`
            ).join('');
          } else {
            container.innerHTML = '<span class="text-muted">No custom domains attached</span>';
          }
        }
      } catch(e) {
        const container = document.getElementById('configDomainsList');
        if (container) {
          container.innerHTML = '<span class="text-muted">Failed to load domains</span>';
        }
      }
    }

    async function copyCodeToClipboard() {
      const code = $('editor').value;
      if (!code) {
        notify("Tidak ada kode untuk dicopy!", true);
        return;
      }
      
      try {
        await navigator.clipboard.writeText(code);
        notify("✅ Kode berhasil dicopy ke clipboard!");
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        notify("✅ Kode berhasil dicopy ke clipboard!");
      }
    }
    
    function downloadCode() {
      const code = $('editor').value;
      if (!code) {
        notify("Tidak ada kode untuk didownload!", true);
        return;
      }
      
      const workerName = currentLoadedWorkerName || $('updateWorkerSelect').value || $('newWorkerName').value || 'worker';
      const filename = \`\${workerName}.js\`;
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify(\`✅ Kode berhasil didownload sebagai \${filename}\`);
    }

    function selectEditorMode(mode) {
      currentEditorMode = mode;
      
      $('panelImportUrl').style.display = 'none';
      $('panelImportFile').style.display = 'none';
      $('panelManual').style.display = 'none';
      $('panelUpdate').style.display = 'none';
      
      const modes = ['url', 'file', 'manual', 'update'];
      modes.forEach(m => {
        const el = $('mode' + m.charAt(0).toUpperCase() + m.slice(1));
        if (el) el.classList.remove('selected');
      });
      
      $('editorPanel').style.display = 'block';
      
      if (mode === 'url') {
        $('panelImportUrl').style.display = 'block';
        $('modeImportUrl').classList.add('selected');
      } else if (mode === 'file') {
        $('panelImportFile').style.display = 'block';
        $('modeImportFile').classList.add('selected');
      } else if (mode === 'manual') {
        $('panelManual').style.display = 'block';
        $('modeManual').classList.add('selected');
      } else if (mode === 'update') {
        $('panelUpdate').style.display = 'block';
        $('modeUpdate').classList.add('selected');
        updateUpdateWorkerSelect();
      }
    }
    
    function updateUpdateWorkerSelect() {
      const select = $('updateWorkerSelect');
      if (workersList.length > 0) {
        select.innerHTML = '<option value="">Pilih Worker...</option>' + 
          workersList.map(w => \`<option value="\${w.id}">\${w.id}</option>\`).join('');
      } else {
        select.innerHTML = '<option value="">Belum ada worker, buat dulu</option>';
      }
    }
    
    function enableCopyDownloadButtons(enabled) {
      const copyBtn = $('copyCodeBtn');
      const downloadBtn = $('downloadCodeBtn');
      if (enabled) {
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
      } else {
        copyBtn.disabled = true;
        downloadBtn.disabled = true;
      }
    }
    
    async function loadWorkerToEditor() {
      const workerName = $('updateWorkerSelect').value;
      if (!workerName || !currentAcc) {
        notify("Pilih worker terlebih dahulu!", true);
        return;
      }
      
      notify("Mengambil kode worker...");
      try {
        const res = await fetch('/api/get?name=' + encodeURIComponent(workerName), {
          headers: { 'X-Auth-Email': currentAcc.email, 'X-Auth-Key': currentAcc.key }
        });
        const d = await res.json();
        if (d.success) {
          $('editor').value = d.code;
          updateView();
          $('newWorkerName').value = '';
          currentLoadedWorkerName = workerName;
          enableCopyDownloadButtons(true);
          notify(\`✅ Kode worker "\${workerName}" berhasil dimuat ke editor!\`);
        } else {
          throw new Error(d.errors?.[0]?.message || "Gagal ambil kode");
        }
      } catch(e) {
        notify("❌ Gagal ambil kode: " + e.message, true);
        enableCopyDownloadButtons(false);
      }
    }

    function setMode(mode) {
      currentMode = mode;
      const singleBtn = $('modeSingleBtn');
      const multipleBtn = $('modeMultipleBtn');
      const singleForm = $('singleModeForm');
      const multipleForm = $('multipleModeForm');
      
      if (mode === 'single') {
        singleBtn.classList.add('active');
        multipleBtn.classList.remove('active');
        singleForm.style.display = 'block';
        multipleForm.style.display = 'none';
      } else {
        singleBtn.classList.remove('active');
        multipleBtn.classList.add('active');
        singleForm.style.display = 'none';
        multipleForm.style.display = 'block';
      }
    }
    
    function clearMultipleInput() {
      $('multipleDomains').value = '';
      $('multipleResult').style.display = 'none';
      $('multipleResult').innerHTML = '';
    }
    
    function parseMultipleDomains(input) {
      let domains = [];
      let temp = input.replace(/\\n/g, ',');
      let parts = temp.split(',');
      
      for (let part of parts) {
        let trimmed = part.trim();
        if (trimmed) {
          domains.push(trimmed);
        }
      }
      return domains;
    }

    function handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        readFileContent(file);
        enableCopyDownloadButtons(true);
      }
    }

    function handleDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      $('fileUploadArea').classList.add('dragover');
    }

    function handleDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();
      $('fileUploadArea').classList.remove('dragover');
    }

    function handleFileDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      $('fileUploadArea').classList.remove('dragover');
      
      const file = event.dataTransfer.files[0];
      if (file) {
        readFileContent(file);
        enableCopyDownloadButtons(true);
      }
    }

    function readFileContent(file) {
      const validExtensions = ['.js', '.txt', '.mjs', '.cjs'];
      const fileName = file.name;
      const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      
      if (!validExtensions.includes(fileExt)) {
        notify(\`File type tidak didukung! Gunakan: \${validExtensions.join(', ')}\`, true);
        return;
      }
      
      notify(\`Membaca file: \${fileName}\`);
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const content = e.target.result;
        $('editor').value = content;
        updateView();
        currentLoadedWorkerName = fileName.replace(/\\.[^/.]+$/, "");
        notify(\`✅ File "\${fileName}" berhasil diimport! (\${(content.length / 1024).toFixed(2)} KB)\`);
      };
      reader.onerror = function() {
        notify("Gagal membaca file!", true);
      };
      reader.readAsText(file);
    }

    function toggleAddFormSidebar() {
      const form = $('addAccFormSidebar');
      const btns = $('accActionBtnsSidebar');
      if (form.style.display === 'none') {
        form.style.display = 'block';
        btns.style.display = 'none';
      } else {
        form.style.display = 'none';
        btns.style.display = 'block';
      }
    }
    
    function saveAccountSidebar() {
      const email = $('accEmailSidebar').value.trim();
      const key = $('accKeySidebar').value.trim();
      if(!email || !key) return notify("Isi Email dan Global Key!", true);
      accounts.push({ email, key });
      localStorage.setItem('cf_accounts_v2', JSON.stringify(accounts));
      $('accEmailSidebar').value = '';
      $('accKeySidebar').value = '';
      toggleAddFormSidebar();
      updateAccSelectorSidebar();
      const sidebarCanvas = bootstrap.Offcanvas.getInstance($('sidebarCanvas'));
      if (sidebarCanvas) sidebarCanvas.hide();
    }
    
    function deleteAccountSidebar() {
      const idx = $('accSelectorSidebar').value;
      if(idx === "-1" || !confirm("Hapus akun ini?")) return;
      accounts.splice(idx, 1);
      localStorage.setItem('cf_accounts_v2', JSON.stringify(accounts));
      updateAccSelectorSidebar();
    }
    
    function switchAccountSidebar() {
      const idx = $('accSelectorSidebar').value;
      if(idx !== "-1" && accounts[idx]) {
        currentAcc = accounts[idx];
        selectedWorkers.clear();
        fetchList();
        $('statusBadge').style.display = 'inline-block';
        document.getElementById('connectionStatus').innerHTML = 'Connected';
      } else {
        $('statusBadge').style.display = 'none';
      }
    }
    
    function updateAccSelectorSidebar() {
      if(accounts.length === 0) {
        $('accSelectorSidebar').innerHTML = '<option value="-1">Belum ada akun</option>';
        currentAcc = null;
        $('statusBadge').style.display = 'none';
      } else {
        $('accSelectorSidebar').innerHTML = accounts.map((a, i) => \`<option value="\${i}">\${a.email}</option>\`).join('');
        switchAccountSidebar();
      }
    }

    function toggleAddDomainForm() {
      const form = $('addDomainForm');
      const btn = $('showAddBtn');
      if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.style.display = 'none';
      } else {
        form.style.display = 'none';
        btn.style.display = 'block';
      }
    }

    function setExampleUrl(url) {
      $('githubUrl').value = url;
    }

    async function fetchList() {
      if(!currentAcc) {
        $('workerListContainer').innerHTML = '<div class="text-center text-muted py-3">Pilih akun dulu</div>';
        return;
      }
      
      notify("Memuat daftar worker...");
      try {
        const res = await fetch('/api/list', {
          headers: { 'X-Auth-Email': currentAcc.email, 'X-Auth-Key': currentAcc.key }
        });
        const d = await res.json();
        if(d.success) {
          workersList = d.result || [];
          selectedWorkers.clear();
          renderWorkerList();
          updateSelectionUI();
          
          $('customDomainSelect').disabled = false;
          $('loadDomainsBtn').disabled = false;
          $('customDomainSelect').innerHTML = '<option value="">Pilih Worker</option>' + 
            workersList.map(w => \`<option value="\${w.id}">\${w.id}</option>\`).join('');
          
          updateUpdateWorkerSelect();
          notify(\`✅ \${workersList.length} worker ditemukan\`);
        } else {
          throw new Error(d.errors?.[0]?.message || "Gagal load");
        }
      } catch(e) { 
        notify(e.message, true);
        $('workerListContainer').innerHTML = '<div class="text-center text-danger py-3">Gagal memuat worker</div>';
      }
    }

    async function loadCustomDomains() {
      const workerName = $('customDomainSelect').value;
      if(!workerName || !currentAcc) {
        notify("Pilih worker terlebih dahulu!", true);
        return;
      }
      
      notify("Memuat domain...");
      try {
        const res = await fetch('/api/get-custom-domains?name=' + encodeURIComponent(workerName), {
          headers: { 'X-Auth-Email': currentAcc.email, 'X-Auth-Key': currentAcc.key }
        });
        const data = await res.json();
        
        if(data.success) {
          availableZones = data.zones || [];
          const zoneOptions = availableZones.map(z => \`<option value="\${z.zone_id}">\${z.zone_name}</option>\`).join('');
          $('zoneSelect').innerHTML = zoneOptions;
          $('zoneSelectMultiple').innerHTML = zoneOptions;
          
          currentWorkerDomains = data.customDomains || [];
          $('domainList').innerHTML = currentWorkerDomains.length === 0 ? 
            '<div class="text-center text-muted py-3"><i class="fas fa-globe fa-2x mb-2 d-block"></i>Belum ada custom domain</div>' :
            currentWorkerDomains.map(domain => \`
              <div class="domain-item p-3 mb-2">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <div class="fw-bold"><i class="fas fa-link text-success me-1"></i> \${domain.hostname}</div>
                    <div class="small text-success"><i class="fas fa-lock me-1"></i> SSL: Let's Encrypt</div>
                    <small class="text-muted">Env: \${domain.environment}</small>
                  </div>
                  <button class="btn btn-sm btn-outline-danger rounded-circle" onclick="deleteCustomDomain('\${domain.id}')">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
            \`).join('');
          notify("✅ Domain berhasil dimuat!");
        } else {
          notify("❌ Gagal load domain: " + (data.error || "Unknown error"), true);
        }
      } catch(e) {
        notify("❌ Gagal load domain: " + e.message, true);
      }
    }
    
    async function attachCustomDomain() {
      const workerName = $('customDomainSelect').value;
      let domainInput = $('newDomain').value.trim();
      const zoneId = $('zoneSelect').value;
      
      if(!workerName || !domainInput || !zoneId) return notify("Lengkapi data domain!", true);
      
      const selectedZone = availableZones.find(z => z.zone_id === zoneId);
      if(!selectedZone) return notify("Zone tidak ditemukan!", true);
      
      if (!/^[a-zA-Z0-9.-]+$/.test(domainInput)) {
        notify("Subdomain hanya boleh berisi huruf, angka, titik, dan strip (-)!", true);
        return;
      }
      
      const fullDomain = \`\${domainInput}.\${selectedZone.zone_name}\`;
      
      if(!fullDomain.match(/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\\.[a-zA-Z]{2,}$/)) {
        notify(\`Domain tidak valid! Pastikan "\${domainInput}" adalah subdomain yang valid.\`, true);
        return;
      }
      
      notify(\`Mengattach domain \${fullDomain}...\`);
      try {
        const res = await fetch('/api/attach-domain', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAcc.email,
            'X-Auth-Key': currentAcc.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ workerName, domain: fullDomain, zoneId })
        });
        const d = await res.json();
        if(d.success) {
          notify(\`✅ \${d.message}\`);
          $('newDomain').value = '';
          toggleAddDomainForm();
          loadCustomDomains();
        } else {
          notify("❌ Gagal: " + (d.message || d.error), true);
        }
      } catch(e) {
        notify("❌ Error: " + e.message, true);
      }
    }
    
    async function attachMultipleDomains() {
      const workerName = $('customDomainSelect').value;
      const domainInput = $('multipleDomains').value.trim();
      const zoneId = $('zoneSelectMultiple').value;
      
      if(!workerName || !domainInput || !zoneId) {
        notify("Lengkapi data domain!", true);
        return;
      }
      
      const selectedZone = availableZones.find(z => z.zone_id === zoneId);
      if(!selectedZone) {
        notify("Zone tidak ditemukan!", true);
        return;
      }
      
      const subdomains = parseMultipleDomains(domainInput);
      
      if(subdomains.length === 0) {
        notify("Tidak ada subdomain yang valid!", true);
        return;
      }
      
      const domains = [];
      const invalidDomains = [];
      
      for (let sub of subdomains) {
        if (!/^[a-zA-Z0-9.-]+$/.test(sub)) {
          invalidDomains.push(sub);
          continue;
        }
        const fullDomain = \`\${sub}.\${selectedZone.zone_name}\`;
        if(fullDomain.match(/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\\.[a-zA-Z]{2,}$/)) {
          domains.push(fullDomain);
        } else {
          invalidDomains.push(sub);
        }
      }
      
      if(domains.length === 0) {
        notify("Tidak ada domain yang valid untuk diattach!", true);
        return;
      }
      
      if(invalidDomains.length > 0) {
        notify(\`⚠️ \${invalidDomains.length} subdomain tidak valid: \${invalidDomains.join(', ')}\`, true);
      }
      
      notify(\`Mengattach \${domains.length} domain ke worker \${workerName}...\`);
      
      try {
        const res = await fetch('/api/attach-multiple-domains', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAcc.email,
            'X-Auth-Key': currentAcc.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ workerName, domains, zoneId })
        });
        const result = await res.json();
        
        const resultDiv = $('multipleResult');
        resultDiv.style.display = 'block';
        
        let successHtml = '<div class="mt-2"><strong>Hasil Attach Domain:</strong></div>';
        successHtml += '<div class="mt-2">';
        for (let r of result.results) {
          const statusClass = r.success ? 'text-success' : 'text-danger';
          const statusIcon = r.success ? '✅' : '❌';
          successHtml += \`
            <div class="d-flex justify-content-between align-items-center mb-2 p-2 rounded" style="background: rgba(0,0,0,0.3);">
              <span><code>\${r.domain}</code></span>
              <span class="\${statusClass}">\${statusIcon} \${r.message}</span>
            </div>
          \`;
        }
        successHtml += \`</div><div class="mt-2 text-center">Total: \${result.total} | Berhasil: \${result.successCount} | Gagal: \${result.failedCount}</div>\`;
        resultDiv.innerHTML = successHtml;
        
        notify(\`✅ Selesai! \${result.successCount} dari \${result.total} domain berhasil diattach\`, false);
        loadCustomDomains();
      } catch(e) {
        notify("❌ Error: " + e.message, true);
      }
    }
    
    async function deleteCustomDomain(domainId) {
      if(!confirm("Yakin ingin menghapus custom domain ini?")) return;
      
      notify("Menghapus domain...");
      try {
        const res = await fetch('/api/delete-domain', {
          method: 'POST',
          headers: {
            'X-Auth-Email': currentAcc.email,
            'X-Auth-Key': currentAcc.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ domainId })
        });
        const d = await res.json();
        if(d.success) {
          notify("✅ Domain berhasil dihapus!");
          loadCustomDomains();
        } else {
          notify("❌ Gagal: " + (d.message || d.error), true);
        }
      } catch(e) {
        notify("❌ Error: " + e.message, true);
      }
    }

    async function importFromUrl() {
      const url = $('githubUrl').value.trim();
      if(!url) return notify("Masukkan URL!", true);
      
      notify("Mengambil kode...");
      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importUrl: url })
        });
        const d = await res.json();
        if(d.success) {
          $('editor').value = d.code;
          updateView();
          enableCopyDownloadButtons(true);
          notify("✅ Kode berhasil diimport!");
        } else {
          throw new Error(d.error || "Gagal mengambil kode");
        }
      } catch(e) {
        notify("❌ Gagal: " + e.message, true);
        enableCopyDownloadButtons(false);
      }
    }

    async function deployWorker() {
      let workerName = $('newWorkerName').value.trim();
      const code = $('editor').value;
      
      if(!code) return notify("Kode masih kosong!", true);
      
      if (!workerName && currentEditorMode === 'update') {
        workerName = $('updateWorkerSelect').value;
        if (!workerName) {
          return notify("Pilih worker dari dropdown update atau isi nama baru!", true);
        }
      }
      
      if(!workerName) return notify("Isi nama worker baru atau pilih worker yang akan diupdate!", true);
      
      notify("Mendeploy ke Cloudflare...");
      try {
        const res = await fetch('/api/update', {
          method: 'POST',
          headers: { 
            'X-Auth-Email': currentAcc.email, 
            'X-Auth-Key': currentAcc.key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: workerName, code: code })
        });
        const d = await res.json();
        if(d.success) {
          const deployUrl = d.subdomain || \`https://\${workerName}.workers.dev\`;
          notify(\`✅ BERHASIL DI-DEPLOY!\\nWorker: \${workerName}\\nURL: \${deployUrl}\`);
          fetchList();
          $('newWorkerName').value = '';
          currentLoadedWorkerName = workerName;
          if (currentEditorMode === 'update') {
            $('updateWorkerSelect').value = '';
          }
          enableCopyDownloadButtons(true);
        } else {
          notify("❌ Gagal: " + (d.errors?.[0]?.message || "Unknown error"), true);
        }
      } catch(e) { 
        notify("❌ Network Error: " + e.message, true); 
      }
    }

    function updateView() {
      let code = $('editor').value;
      if(code && code[code.length-1] == "\\n") code += " ";
      $('highlighting-content').textContent = code || '';
      Prism.highlightElement($('highlighting-content'));
    }

    function syncScroll() {
      $('highlighting').scrollTop = $('editor').scrollTop;
      $('highlighting').scrollLeft = $('editor').scrollLeft;
    }

    updateAccSelectorSidebar();
    setMode('single');
    
    $('editorPanel').style.display = 'none';
    enableCopyDownloadButtons(false);

    $('editor').onkeydown = function(e) {
      if(e.key == 'Tab') {
        e.preventDefault();
        const s = this.selectionStart;
        this.value = this.value.substring(0, s) + "  " + this.value.substring(this.selectionEnd);
        this.selectionEnd = s + 2;
        updateView();
      }
    };
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
