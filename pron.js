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

  async getUserInfo() { return this._fetch("/user"); }
  async getAccounts() { return this._fetch("/accounts"); }
  async listWorkers(accountId) { return this._fetch(`/accounts/${accountId}/workers/services`); }

  async getWorkerScript(accountId, workerName) {
    const url = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/environments/production/content`;
    let response = await fetch(url, { headers: { "X-Auth-Email": this.email, "X-Auth-Key": this.apiKey } });

    if (!response.ok) {
      const fallbackUrl = `${CF_BASE_URL}/accounts/${accountId}/workers/services/${workerName}/content`;
      response = await fetch(fallbackUrl, { headers: { "X-Auth-Email": this.email, "X-Auth-Key": this.apiKey } });
      if (!response.ok) throw new Error(`Failed to fetch worker script: ${response.status}`);
    }

    let scriptContent = await response.text();
    scriptContent = scriptContent.replace(/^--[a-f0-9]+(\r?\n)Content-Disposition: form-data; name="[^"]+"(\r?\n\r?\n)?/gm, '');
    scriptContent = scriptContent.replace(/--[a-f0-9]+--(\r?\n)?$/g, '');
    scriptContent = scriptContent.replace(/--[a-f0-9]+(\r?\n)Content-Disposition: form-data; name="[^"]+"(\r?\n\r?\n)?/g, '');
    return scriptContent.trim();
  }

  async updateWorker(accountId, workerName, scriptContent) {
    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
    const metadata = { main_module: "worker.js", compatibility_date: "2024-12-03", compatibility_flags: ["nodejs_compat"] };
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
    try {
      const domainsData = await this.listCustomDomains(accountId);
      if (domainsData.success && domainsData.result) {
        const workerDomains = domainsData.result.filter(d => d.service === workerName);
        for (const domain of workerDomains) { await this.deleteCustomDomain(accountId, domain.id); }
      }
    } catch (e) {}
    return this._fetch(`/accounts/${accountId}/workers/services/${workerName}`, { method: 'DELETE' });
  }

  async listZones(name = "") {
    let path = "/zones?status=active&per_page=50";
    if (name) path += `&name=${name}`;
    return this._fetch(path);
  }

  async registerCustomDomain(accountId, workerName, hostname, zoneId) {
    return this._fetch(`/accounts/${accountId}/workers/domains`, {
      method: 'PUT',
      body: JSON.stringify({ environment: "production", hostname: hostname, service: workerName, zone_id: zoneId })
    });
  }

  async listCustomDomains(accountId) { return this._fetch(`/accounts/${accountId}/workers/domains`); }
  async deleteCustomDomain(accountId, domainId) { return this._fetch(`/accounts/${accountId}/workers/domains/${domainId}`, { method: 'DELETE' }); }
}

// ==================== API HANDLER ====================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Email, X-Auth-Key',
};

async function handleApiRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // No auth required
  if (path === '/api/generateProxyIP') {
    try {
      const response = await fetch(PROXY_LIST_URL);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const randomLine = lines[Math.floor(Math.random() * lines.length)];
      const proxyIP = randomLine.split(',')[0];
      return new Response(JSON.stringify({ success: true, proxyIP }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) { return new Response(JSON.stringify({ success: false, message: e.message }), { status: 500, headers: corsHeaders }); }
  }

  if (path === '/api/import' && request.method === 'POST') {
    try {
      const { importUrl } = await request.json();
      const res = await fetch(importUrl);
      const code = await res.text();
      return new Response(JSON.stringify({ success: true, code }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) { return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400, headers: corsHeaders }); }
  }

  // Auth required endpoints (body-based)
  try {
    const body = await request.json();
    const { email, globalAPIKey, accountId } = body;
    const authEmail = email || request.headers.get("X-Auth-Email");
    const authKey = globalAPIKey || request.headers.get("X-Auth-Key");

    if (!authEmail || !authKey) return new Response(JSON.stringify({ success: false, message: "Unauthorized: Missing Email or Key" }), { status: 401, headers: corsHeaders });

    const client = new CfClient(authEmail, authKey);
    let targetAccountId = accountId;
    const ensureAccountId = async () => {
      if (!targetAccountId) { const accs = await client.getAccounts(); targetAccountId = accs.result[0].id; }
      return targetAccountId;
    };

    switch (path) {
      case '/api/userInfo': return new Response(JSON.stringify(await client.getUserInfo()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      case '/api/accounts': return new Response(JSON.stringify(await client.getAccounts()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      case '/api/listWorkers':
      case '/api/list': {
        const accId = await ensureAccountId();
        const data = await client.listWorkers(accId);
        const subdomain = await client.getOrCreateSubdomain(accId);
        if (data.success && data.result) { data.result.forEach(w => { w.url = `https://${w.id}.${subdomain}.workers.dev`; w.subdomain = subdomain; }); }
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/getWorkerScript':
      case '/api/get': {
        const accId = await ensureAccountId();
        const workerName = body.workerName || url.searchParams.get("name");
        const script = await client.getWorkerScript(accId, workerName);
        const subdomain = await client.getOrCreateSubdomain(accId);
        return new Response(JSON.stringify({ success: true, code: script, scriptContent: script, url: `https://${workerName}.${subdomain}.workers.dev` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/updateWorker':
      case '/api/update': {
        const accId = await ensureAccountId();
        const workerName = body.workerName || body.name;
        const code = body.scriptContent || body.code;
        await client.updateWorker(accId, workerName, code);
        const subdomain = await client.getOrCreateSubdomain(accId);
        return new Response(JSON.stringify({ success: true, message: "Worker updated", subdomain: `https://${workerName}.${subdomain}.workers.dev` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/deleteWorker':
      case '/api/delete': {
        const accId = await ensureAccountId();
        const workerName = body.workerName || body.name;
        await client.deleteWorker(accId, workerName);
        return new Response(JSON.stringify({ success: true, message: "Worker deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/bulkDeleteWorkers':
      case '/api/delete-bulk': {
        const accId = await ensureAccountId();
        const names = body.workerNames || body.names;
        const results = await Promise.allSettled(names.map(name => client.deleteWorker(accId, name)));
        return new Response(JSON.stringify({
          success: true,
          results: results.map((r, i) => ({ name: names[i], success: r.status === 'fulfilled', message: r.status === 'fulfilled' ? "Success" : r.reason.message })),
          total: names.length, successCount: results.filter(r => r.status === 'fulfilled').length, failedCount: results.filter(r => r.status === 'rejected').length
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/createWorker': {
        const accId = await ensureAccountId();
        const { workerName, workerScriptUrl, template } = body;
        const res = await fetch(workerScriptUrl || DEFAULT_SCRIPT_URL);
        let script = await res.text();
        const uuid = generateUUID();
        script = script.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, uuid);
        let proxyIP = "";
        if (template === 'nautica') {
          const pRes = await fetch(PROXY_LIST_URL);
          const pText = await pRes.text();
          const pLines = pText.split('\n').filter(l => l.trim());
          proxyIP = pLines[Math.floor(Math.random() * pLines.length)].split(',')[0];
          script = script.replace(/const proxyIP = ".*?";/, `const proxyIP = "${proxyIP}";`);
        }
        const result = await client.createWorker(accId, sanitizeWorkerName(workerName), script);
        const host = `${result.workerName}.${result.subdomain}.workers.dev`;
        return new Response(JSON.stringify({
          success: true, message: "Worker created", url: `https://${host}`, proxyIP, uuid,
          vless: `vless://${uuid}@suporte.garena.com:443?encryption=none&security=tls&sni=${host}&fp=randomized&type=ws&host=${host}&path=%2FALL1#${result.workerName}`,
          trojan: `trojan://${uuid}@suporte.garena.com:443?sni=${host}&type=ws&host=${host}&path=%2FALL1#${result.workerName}`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/bulkCreateWorkers': {
        const { accounts: bAccs, workerName, workerScriptUrl, template } = body;
        const sRes = await fetch(workerScriptUrl || DEFAULT_SCRIPT_URL);
        const baseScript = await sRes.text();
        const results = await Promise.all(bAccs.map(async (acc) => {
          try {
            const accClient = new CfClient(acc.email, acc.apiKey);
            const uuid = generateUUID();
            let script = baseScript.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, uuid);
            if (template === 'nautica') {
              const pRes = await fetch(PROXY_LIST_URL);
              const pText = await pRes.text();
              const pLines = pText.split('\n').filter(l => l.trim());
              const pIP = pLines[Math.floor(Math.random() * pLines.length)].split(',')[0];
              script = script.replace(/const proxyIP = ".*?";/, `const proxyIP = "${pIP}";`);
            }
            await accClient.createWorker(acc.accountId, sanitizeWorkerName(workerName), script);
            return { email: acc.email, success: true };
          } catch (e) { return { email: acc.email, success: false, message: e.message }; }
        }));
        return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/get-custom-domains': {
        const accId = await ensureAccountId();
        const name = body.workerName || url.searchParams.get("name");
        const domains = await client.listCustomDomains(accId);
        const zones = await client.listZones();
        const subdomain = await client.getOrCreateSubdomain(accId);
        return new Response(JSON.stringify({
          success: true, customDomains: domains.result.filter(d => d.service === name),
          zones: zones.result.map(z => ({ zone_id: z.id, zone_name: z.name })),
          subdomain: `https://${name}.${subdomain}.workers.dev`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/attach-domain': {
        const accId = await ensureAccountId();
        const res = await client.registerCustomDomain(accId, body.workerName, body.domain, body.zoneId);
        return new Response(JSON.stringify({ success: true, message: "Success", domainId: res.result.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/attach-multiple-domains': {
        const accId = await ensureAccountId();
        const { workerName, domains, zoneId } = body;
        const results = [];
        for (const domain of domains) {
          try { await client.registerCustomDomain(accId, workerName, domain, zoneId); results.push({ domain, success: true }); }
          catch(e) { results.push({ domain, success: false, message: e.message }); }
        }
        return new Response(JSON.stringify({ success: true, results, successCount: results.filter(r => r.success).length, failedCount: results.filter(r => !r.success).length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/delete-domain': {
        const accId = await ensureAccountId();
        await client.deleteCustomDomain(accId, body.domainId);
        return new Response(JSON.stringify({ success: true, message: "Deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      case '/api/autoDiscoverConfig': {
        const root = body.targetDomain.split('.').filter(p => p !== '*').slice(-2).join('.');
        const zones = await client.listZones(root);
        if (zones.result?.[0]) return new Response(JSON.stringify({ success: true, accountId: zones.result[0].account.id, zone: zones.result[0] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: false, message: "Not found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      default: return new Response(JSON.stringify({ success: false, message: "Not found" }), { status: 404, headers: corsHeaders });
    }
  } catch (error) { return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: corsHeaders }); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApiRequest(request);

    const html = `
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
    :root { --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    body { background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); background-attachment: fixed; font-family: 'Poppins', sans-serif; min-height: 100vh; color: #fff; }
    .navbar-glass { background: rgba(15, 20, 40, 0.8); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(102, 126, 234, 0.3); }
    .card-modern { background: rgba(15, 25, 45, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 15px; margin-bottom: 20px; transition: 0.3s; }
    .card-modern:hover { transform: translateY(-3px); border-color: rgba(102, 126, 234, 0.6); }
    .btn-gradient { background: var(--primary-gradient); border: none; color: white; border-radius: 10px; padding: 0.5rem 1.2rem; }
    .form-control, .form-select { background: rgba(10, 20, 40, 0.8); border: 1px solid rgba(102, 126, 234, 0.3); color: #fff; border-radius: 10px; }
    .worker-item { background: rgba(20, 30, 55, 0.6); border: 1px solid rgba(102, 126, 234, 0.2); border-radius: 12px; padding: 15px; margin-bottom: 10px; }
    .editor-container { position: relative; height: 400px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(102, 126, 234, 0.3); }
    #editor, #highlighting { position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 15px; margin: 0; tab-size: 2; font-family: monospace; font-size: 14px; line-height: 1.5; overflow: auto; white-space: pre; }
    #editor { background: transparent !important; color: transparent; caret-color: #fff; z-index: 1; outline: none; resize: none; -webkit-text-fill-color: transparent; }
    #highlighting { z-index: 0; pointer-events: none; }
    .offcanvas { background: rgba(15, 20, 40, 0.95); backdrop-filter: blur(20px); border-right: 1px solid rgba(102, 126, 234, 0.3); width: 350px !important; }
    .mode-option { cursor: pointer; border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 10px; padding: 10px; transition: 0.2s; background: rgba(255,255,255,0.05); }
    .mode-option:hover { background: rgba(255,255,255,0.1); }
    .mode-option.selected { border-color: #00b09b; background: rgba(0, 176, 155, 0.1); }
    .bulk-actions-bar { background: rgba(102, 126, 234, 0.2); border-radius: 10px; padding: 10px; margin-bottom: 15px; border: 1px solid rgba(102, 126, 234, 0.4); }
    .cursor-pointer { cursor: pointer; }
  </style>
</head>
<body>
  <nav class="navbar navbar-glass fixed-top px-4 shadow">
    <div class="d-flex align-items-center gap-3">
      <button class="btn btn-outline-info rounded-circle" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebarCanvas"><i class="fas fa-bars"></i></button>
      <span class="navbar-brand mb-0 h1 text-white fw-bold"><i class="fas fa-cloud me-2"></i>CFM PRO</span>
    </div>
    <div id="statusBadge" class="badge bg-success shadow-sm" style="display: none;"><i class="fas fa-check-circle me-1"></i>Connected</div>
  </nav>

  <div class="offcanvas offcanvas-start" tabindex="-1" id="sidebarCanvas">
    <div class="offcanvas-header border-bottom border-secondary">
      <h5 class="offcanvas-title text-white fw-bold">Management</h5>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
    </div>
    <div class="offcanvas-body">
      <div class="mb-4">
        <label class="form-label small text-info fw-bold">ACCOUNT SELECTOR</label>
        <select id="accSelector" class="form-select mb-2" onchange="switchAccount()"></select>
        <div id="addAccForm" style="display: none;" class="mt-3 p-3 border border-secondary rounded bg-dark">
          <input id="accEmail" class="form-control mb-2" placeholder="Cloudflare Email">
          <input id="accKey" class="form-control mb-2" type="password" placeholder="Global API Key">
          <button onclick="saveAccount()" class="btn btn-gradient w-100">Save Account</button>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button onclick="$('addAccForm').style.display='block'" class="btn btn-sm btn-outline-info flex-grow-1"><i class="fas fa-plus me-1"></i>Add</button>
          <button onclick="deleteAccount()" class="btn btn-sm btn-outline-danger flex-grow-1"><i class="fas fa-trash me-1"></i>Remove</button>
        </div>
      </div>
      <hr class="border-secondary">
      <div class="mb-4">
        <h6 class="text-warning fw-bold"><i class="fas fa-layer-group me-2"></i>BULK DEPLOY</h6>
        <p class="small text-muted">Deploy a worker to ALL registered accounts simultaneously.</p>
        <input id="bulkName" class="form-control mb-2" placeholder="Worker Name">
        <select id="bulkTemp" class="form-select mb-2">
          <option value="default">Default Script</option>
          <option value="nautica">Nautica (VPN Config)</option>
        </select>
        <button onclick="bulkCreate()" class="btn btn-gradient w-100 mt-2 shadow"><i class="fas fa-rocket me-2"></i>Deploy to All</button>
      </div>
    </div>
  </div>

  <div class="container" style="margin-top: 100px; padding-bottom: 50px;">
    <div class="row g-4">
      <div class="col-lg-5">
        <div class="card card-modern shadow">
          <div class="card-header d-flex justify-content-between align-items-center bg-dark bg-opacity-50">
            <span class="fw-bold text-info"><i class="fas fa-list me-2"></i>WORKER LIST</span>
            <div class="d-flex gap-2">
              <button onclick="openQuickCreate()" class="btn btn-sm btn-success shadow-sm"><i class="fas fa-bolt me-1"></i>Quick</button>
              <button onclick="fetchList()" class="btn btn-sm btn-info text-white shadow-sm"><i class="fas fa-sync"></i></button>
            </div>
          </div>
          <div class="card-body">
            <div id="selectionBar" class="bulk-actions-bar d-flex justify-content-between align-items-center" style="display: none !important;">
              <span id="selCount" class="small fw-bold text-white">0 selected</span>
              <button onclick="bulkDelete()" class="btn btn-sm btn-danger shadow-sm">Delete Selected</button>
            </div>
            <div id="workerList" style="max-height: 450px; overflow-y: auto;" class="pe-2"></div>
          </div>
        </div>

        <div class="card card-modern shadow">
          <div class="card-header bg-dark bg-opacity-50 fw-bold text-success"><i class="fas fa-globe me-2"></i>DOMAIN MANAGER</div>
          <div class="card-body">
            <label class="small text-muted mb-1">Target Worker:</label>
            <select id="domainWorkerSelect" class="form-select mb-3 shadow-sm" disabled onchange="loadDomains()"><option>Select a worker above</option></select>
            <div id="domainList" class="mb-3" style="max-height: 200px; overflow-y: auto;"></div>
            <div class="btn-group w-100 mb-3 shadow-sm">
              <button id="modeS" class="btn btn-sm btn-outline-info active" onclick="setDomMode('S')">Single Mode</button>
              <button id="modeM" class="btn btn-sm btn-outline-info" onclick="setDomMode('M')">Bulk Mode</button>
            </div>
            <div id="domSingle" class="p-2 border border-secondary rounded bg-dark bg-opacity-25">
              <input id="domSub" class="form-control mb-2" placeholder="Subdomain (e.g. api)">
              <select id="domZone" class="form-select mb-2"></select>
              <button onclick="attachDom()" class="btn btn-gradient w-100 shadow">Attach Domain</button>
            </div>
            <div id="domMulti" style="display: none;" class="p-2 border border-secondary rounded bg-dark bg-opacity-25">
              <textarea id="domMultiList" class="form-control mb-2" rows="3" placeholder="sub1, sub2, sub3..."></textarea>
              <select id="domZoneM" class="form-select mb-2"></select>
              <button onclick="attachMultiDom()" class="btn btn-gradient w-100 shadow">Attach All</button>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-7">
        <div class="card card-modern shadow">
          <div class="card-header bg-dark bg-opacity-50 fw-bold text-warning"><i class="fas fa-code me-2"></i>CODE EDITOR</div>
          <div class="card-body">
            <div class="row g-2 mb-3">
              <div class="col-3 text-center mode-option shadow-sm" id="mURL" onclick="setEditMode('url')"><i class="fas fa-link mb-1"></i><br><small>URL</small></div>
              <div class="col-3 text-center mode-option shadow-sm" id="mFILE" onclick="setEditMode('file')"><i class="fas fa-file mb-1"></i><br><small>File</small></div>
              <div class="col-3 text-center mode-option shadow-sm" id="mMAN" onclick="setEditMode('man')"><i class="fas fa-edit mb-1"></i><br><small>Edit</small></div>
              <div class="col-3 text-center mode-option shadow-sm" id="mUPD" onclick="setEditMode('upd')"><i class="fas fa-sync mb-1"></i><br><small>Update</small></div>
            </div>
            <div id="editPanel" style="display: none;">
              <div id="pURL" class="mb-3 animate-fade-in" style="display: none;"><div class="input-group shadow-sm"><input id="urlInp" class="form-control" placeholder="https://raw.../worker.js"><button onclick="impURL()" class="btn btn-info text-white">Import</button></div></div>
              <div id="pFILE" class="mb-3 animate-fade-in" style="display: none;"><input type="file" id="fileInp" class="form-control shadow-sm" onchange="impFILE(event)"></div>
              <div id="pUPD" class="mb-3 animate-fade-in" style="display: none;"><div class="d-flex gap-2 shadow-sm"><select id="updSel" class="form-select"></select><button onclick="loadToEdit()" class="btn btn-info text-white">Load Code</button></div></div>

              <div class="mb-2"><input id="workerNameInp" class="form-control shadow-sm" placeholder="Target Worker Name (e.g. my-app)"></div>

              <div class="editor-container mb-3 shadow-lg">
                <textarea id="editor" spellcheck="false" oninput="updView(); syncScroll();" onscroll="syncScroll();"></textarea>
                <pre id="highlighting"><code id="highContent" class="language-javascript"></code></pre>
              </div>
              <div class="d-flex gap-2">
                <button onclick="deploy()" class="btn btn-gradient flex-grow-1 shadow fw-bold"><i class="fas fa-cloud-upload-alt me-2"></i>DEPLOY / UPDATE WORKER</button>
                <button onclick="copyCode()" class="btn btn-outline-info shadow-sm" title="Copy Code"><i class="fas fa-copy"></i></button>
                <button onclick="downCode()" class="btn btn-outline-info shadow-sm" title="Download JS"><i class="fas fa-download"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modals -->
  <div class="modal fade" id="quickModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content bg-dark text-white border-secondary shadow-lg"><div class="modal-header border-secondary"><h5 class="modal-title"><i class="fas fa-bolt text-warning me-2"></i>Quick Create</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body">
    <label class="small text-info mb-1">Worker Name:</label><input id="qName" class="form-control mb-3" placeholder="my-quick-worker">
    <label class="small text-info mb-1">Select Template:</label><select id="qTemp" class="form-select mb-3"><option value="default">Default Generic</option><option value="nautica">Nautica (Proxy IP & VPN)</option></select>
    <div class="alert alert-info small py-2"><i class="fas fa-info-circle me-1"></i> Nautica will automatically generate VPN configurations.</div>
  </div><div class="modal-footer border-secondary"><button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button onclick="execQuick()" class="btn btn-gradient btn-sm px-4">Deploy Now</button></div></div></div></div>

  <div class="modal fade" id="linksModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content bg-dark text-white border-info shadow-lg"><div class="modal-header border-secondary"><h5 class="modal-title"><i class="fas fa-key text-success me-2"></i>Worker Configurations</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body" id="linksBody"></div><div class="modal-footer border-secondary"><button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button></div></div></div></div>

  <div id="toast" class="position-fixed bottom-0 start-50 translate-middle-x p-3" style="z-index: 9999; display: none;"><div class="bg-dark border border-secondary text-white p-3 rounded shadow-lg" id="toastMsg"></div></div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
  <script>
    const $ = id => document.getElementById(id);
    let accounts = JSON.parse(localStorage.getItem('cf_accounts_v2') || '[]');
    let currentAcc = null, workersList = [], zones = [], selected = new Set(), editMode = null, domMode = 'S';

    function notify(m, err) { const t = $('toast'); $('toastMsg').innerText = m; $('toastMsg').className = err ? 'bg-danger p-3 rounded shadow border border-white' : 'bg-dark border border-success p-3 rounded shadow'; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 5000); }
    
    async function api(path, body = {}) {
      if (currentAcc && !body.email) { body.email = currentAcc.email; body.globalAPIKey = currentAcc.key; }
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "API Request Failed");
      return data;
    }

    function renderList() {
      const c = $('workerList'); if (!workersList.length) { c.innerHTML = '<p class="text-center text-muted my-4">No workers found in this account.</p>'; return; }
      c.innerHTML = workersList.map(w => \`
        <div class="worker-item d-flex align-items-center shadow-sm">
          <input type="checkbox" class="me-3" onchange="toggleSel('\${w.id}', this.checked)" \${selected.has(w.id)?'checked':''}>
          <div class="flex-grow-1 overflow-hidden">
            <div class="fw-bold text-info text-truncate">\${w.id}</div>
            <small class="text-muted d-block text-truncate">\${w.url || ''}</small>
          </div>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-info rounded-circle" data-bs-toggle="dropdown" style="width:30px;height:30px;padding:0;"><i class="fas fa-ellipsis-v"></i></button>
            <ul class="dropdown-menu dropdown-menu-dark shadow">
              <li><a class="dropdown-item cursor-pointer" onclick="viewConf('\${w.id}')"><i class="fas fa-cog me-2"></i>Config / Edit</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger cursor-pointer" onclick="delSingle('\${w.id}')"><i class="fas fa-trash me-2"></i>Delete</a></li>
            </ul>
          </div>
        </div>\`).join('');
    }

    function toggleSel(id, c) { if(c) selected.add(id); else selected.delete(id); updSelUI(); }
    function updSelUI() { const b = $('selectionBar'); if(selected.size > 0) { b.style.setProperty('display', 'flex', 'important'); $('selCount').innerText = selected.size + ' workers selected'; } else b.style.setProperty('display', 'none', 'important'); }
    
    async function fetchList() {
      if(!currentAcc) return;
      notify('Refreshing worker list...');
      try {
        const d = await api('/api/listWorkers');
        workersList = d.result || [];
        renderList();
        const opts = '<option value="">Select a worker</option>' + workersList.map(w=>\`<option value="\${w.id}">\${w.id}</option>\`).join('');
        $('domainWorkerSelect').disabled = false;
        $('domainWorkerSelect').innerHTML = opts;
        $('updSel').innerHTML = opts;
        notify(\`Successfully loaded \${workersList.length} workers.\`);
      } catch(e){ notify(e.message, true); }
    }

    async function viewConf(name) {
      notify(\`Fetching details for \${name}...\`);
      try {
        const d = await api('/api/getWorkerScript', { workerName: name });
        const dd = await api('/api/get-custom-domains', { workerName: name });
        $('linksBody').innerHTML = \`
          <div class="mb-3 border-bottom border-secondary pb-2">
            <p class="mb-1 fw-bold text-info">Worker URL:</p>
            <a href="\${d.url}" target="_blank" class="text-white small">\${d.url}</a>
          </div>
          <h6 class="text-success fw-bold small mb-2">CUSTOM DOMAINS:</h6>
          <div class="bg-black bg-opacity-25 p-2 rounded small mb-3">
            \${dd.customDomains.map(dm=>\`<div class="mb-1 text-muted"><i class="fas fa-link me-2"></i>\${dm.hostname}</div>\`).join('') || '<div class="text-muted italic">No custom domains attached</div>'}
          </div>
          <div class="alert alert-secondary py-2 small">
            <i class="fas fa-info-circle me-2"></i>Click below to load this worker's source code into the editor.
          </div>
          <button onclick="loadToEditFromName('\${name}')" class="btn btn-sm btn-outline-info w-100 mt-2 shadow-sm"><i class="fas fa-code me-2"></i>Load Code to Editor</button>
        \`;
        new bootstrap.Modal($('linksModal')).show();
      } catch(e) { notify(e.message, true); }
    }
    
    function loadToEditFromName(name) {
      bootstrap.Modal.getInstance($('linksModal')).hide();
      setEditMode('upd');
      $('updSel').value = name;
      loadToEdit();
    }

    async function delSingle(name) { if(confirm(\`Are you sure you want to delete worker "\${name}"? This will also remove associated custom domains.\`)) try { notify(\`Deleting \${name}...\`); await api('/api/deleteWorker', { workerName: name }); notify(\`Worker \${name} deleted.\`); fetchList(); } catch(e){ notify(e.message, true); } }
    
    async function bulkDelete() {
      const count = selected.size;
      if(confirm(\`Delete \${count} selected workers? This cannot be undone.\`)) try {
        notify(\`Bulk deleting \${count} workers...\`);
        const res = await api('/api/bulkDeleteWorkers', { workerNames: Array.from(selected) });
        notify(\`Successfully deleted \${res.successCount} workers. Failed: \${res.failedCount}.\`);
        selected.clear(); updSelUI(); fetchList();
      } catch(e){ notify(e.message, true); }
    }

    async function loadDomains() {
      const name = $('domainWorkerSelect').value; if(!name) return;
      try {
        const d = await api('/api/get-custom-domains', { workerName: name }); zones = d.zones || [];
        const opts = zones.map(z=>\`<option value="\${z.zone_id}">\${z.zone_name}</option>\`).join('');
        $('domZone').innerHTML = $('domZoneM').innerHTML = opts;
        $('domainList').innerHTML = d.customDomains.map(dm => \`
          <div class="d-flex justify-content-between align-items-center p-2 border-bottom border-secondary small">
            <span class="text-white"><i class="fas fa-link me-2 text-muted"></i>\${dm.hostname}</span>
            <i class="fas fa-trash-alt text-danger cursor-pointer p-1" title="Remove Domain" onclick="delDom('\${dm.id}')"></i>
          </div>\`).join('') || '<p class="text-muted small italic p-2">No custom domains found for this worker.</p>';
      } catch(e){ notify(e.message, true); }
    }
    
    async function delDom(id) { if(confirm('Remove this custom domain?')) try { notify('Removing domain...'); await api('/api/delete-domain', { domainId: id }); notify('Domain removed successfully.'); loadDomains(); } catch(e){ notify(e.message, true); } }
    
    async function attachDom() {
      const name = $('domainWorkerSelect').value, sub = $('domSub').value.trim(), zid = $('domZone').value; if(!sub || !zid) return notify('Please fill all fields.', true);
      const zone = zones.find(z=>z.zone_id === zid);
      try { notify('Attaching domain...'); await api('/api/attach-domain', { workerName: name, domain: \`\${sub}.\${zone.zone_name}\`, zoneId: zid }); notify('Domain attached successfully.'); $('domSub').value=''; loadDomains(); } catch(e){ notify(e.message, true); }
    }
    
    async function attachMultiDom() {
      const name = $('domainWorkerSelect').value, list = $('domMultiList').value, zid = $('domZoneM').value; if(!list || !zid) return notify('Please fill all fields.', true);
      const zone = zones.find(z=>z.zone_id === zid);
      const domains = list.split(/[\n,]+/).map(s=>s.trim()).filter(s=>s).map(s=>\`\${s}.\${zone.zone_name}\`);
      try { notify(\`Attaching \${domains.length} domains...\`); await api('/api/attach-multiple-domains', { workerName: name, domains, zoneId: zid }); notify('Bulk attachment completed.'); $('domMultiList').value=''; loadDomains(); } catch(e){ notify(e.message, true); }
    }

    async function deploy() {
      const name = $('workerNameInp').value.trim() || (editMode==='upd'?$('updSel').value:'');
      const code = $('editor').value; if(!name || !code) return notify('Worker name and code are required!', true);
      try { notify('Deploying to Cloudflare...'); await api('/api/updateWorker', { workerName: name, scriptContent: code }); notify(\`Worker "\${name}" deployed successfully!\`); fetchList(); } catch(e){ notify(e.message, true); }
    }
    
    function openQuickCreate() { new bootstrap.Modal($('quickModal')).show(); }
    
    async function execQuick() {
      const name = $('qName').value.trim(), temp = $('qTemp').value; if(!name) return notify('Please enter a worker name.', true);
      bootstrap.Modal.getInstance($('quickModal')).hide();
      notify('Creating worker from template...');
      try {
        const d = await api('/api/createWorker', { workerName: name, template: temp });
        $('linksBody').innerHTML = \`
          <div class="alert alert-success d-flex align-items-center mb-3">
             <i class="fas fa-check-circle fa-2x me-3"></i>
             <div><strong>Worker Created!</strong><br><small>Configurations are generated below.</small></div>
          </div>
          <div class="mb-3">
            <label class="small text-info fw-bold mb-1">UUID:</label>
            <div class="input-group shadow-sm">
              <input class="form-control form-control-sm bg-black bg-opacity-50 text-white border-secondary" value="\${d.uuid}" readonly>
              <button class="btn btn-sm btn-outline-info" onclick="navigator.clipboard.writeText('\${d.uuid}'); notify('UUID Copied')"><i class="fas fa-copy"></i></button>
            </div>
          </div>
          <div class="mb-3">
            <label class="small text-success fw-bold mb-1">VLESS CONFIG:</label>
            <textarea class="form-control form-control-sm bg-black bg-opacity-50 text-white border-secondary mb-1" rows="3" readonly style="font-size:11px;">\${d.vless}</textarea>
            <button onclick="navigator.clipboard.writeText('\${d.vless}'); notify('VLess Config Copied')" class="btn btn-sm btn-outline-success w-100 shadow-sm"><i class="fas fa-copy me-2"></i>Copy VLess Config</button>
          </div>
          <div class="mb-3">
            <label class="small text-warning fw-bold mb-1">TROJAN CONFIG:</label>
            <textarea class="form-control form-control-sm bg-black bg-opacity-50 text-white border-secondary mb-1" rows="3" readonly style="font-size:11px;">\${d.trojan}</textarea>
            <button onclick="navigator.clipboard.writeText('\${d.trojan}'); notify('Trojan Config Copied')" class="btn btn-sm btn-outline-warning w-100 shadow-sm"><i class="fas fa-copy me-2"></i>Copy Trojan Config</button>
          </div>
          <div class="p-2 border border-secondary rounded bg-dark small">
            <strong>Worker URL:</strong> <a href="\${d.url}" target="_blank" class="text-info">\${d.url}</a>
          </div>
        \`;
        new bootstrap.Modal($('linksModal')).show(); fetchList();
      } catch(e){ notify(e.message, true); }
    }

    async function bulkCreate() {
      const name = $('bulkName').value.trim(), temp = $('bulkTemp').value;
      if(!name || !accounts.length) return notify('Worker name and at least one account required.', true);
      try {
        notify(\`Preparing deployment to \${accounts.length} accounts...\`);
        const accs = await Promise.all(accounts.map(async a => {
          const client = new CfClient(a.email, a.key);
          const r = await client.getAccounts();
          return { email: a.email, accountId: r.result[0].id, apiKey: a.key };
        }));
        notify(\`Starting bulk deploy of "\${name}"...\`);
        const res = await api('/api/bulkCreateWorkers', { accounts: accs, workerName: name, template: temp });
        const success = res.results.filter(r=>r.success).length;
        notify(\`Bulk deployment finished. Success: \${success}, Failed: \${res.results.length - success}.\`);
      } catch(e){ notify(e.message, true); }
    }

    function setDomMode(m) { domMode=m; $('modeS').classList.toggle('active', m==='S'); $('modeM').classList.toggle('active', m==='M'); $('domSingle').style.display=m==='S'?'block':'none'; $('domMulti').style.display=m==='M'?'block':'none'; }

    function setEditMode(m) {
      editMode=m; $('editPanel').style.display='block';
      ['URL','FILE','MAN','UPD'].forEach(x=>{
        $('m'+x).classList.toggle('selected', x===m.toUpperCase());
        const p=$('p'+x); if(p) p.style.display=x===m.toUpperCase()?'block':'none';
      });
    }

    async function loadToEdit() {
      const name = $('updSel').value;
      if(!name) return notify('Please select a worker first.', true);
      notify('Loading worker code...');
      try { const d = await api('/api/getWorkerScript', { workerName: name }); $('editor').value = d.scriptContent; updView(); notify('Code loaded.'); } catch(e){ notify(e.message, true); }
    }

    async function impURL() {
      const u = $('urlInp').value.trim();
      if(!u) return notify('Please enter a URL.', true);
      notify('Importing from URL...');
      try { const res = await api('/api/import', { importUrl: u }); $('editor').value = res.code; updView(); notify('Code imported.'); } catch(e){ notify(e.message, true); }
    }

    function impFILE(e) {
      const f = e.target.files[0];
      if(f) {
        notify(\`Reading \${f.name}...\`);
        const r = new FileReader();
        r.onload=x=>{ $('editor').value=x.target.result; updView(); notify('File imported.'); };
        r.readAsText(f);
      }
    }

    function copyCode() { navigator.clipboard.writeText($('editor').value); notify('Code copied to clipboard.'); }
    function downCode() {
      const name = $('workerNameInp').value.trim() || 'worker';
      const b = new Blob([$('editor').value], {type:'text/javascript'}), u = URL.createObjectURL(b), a = document.createElement('a');
      a.href=u; a.download=\`\${name}.js\`; a.click();
    }

    function updView() { let c = $('editor').value; if(c[c.length-1]==='\\n') c+=' '; $('highContent').textContent=c; Prism.highlightElement($('highContent')); }
    function syncScroll() { $('highlighting').scrollTop = $('editor').scrollTop; $('highlighting').scrollLeft = $('editor').scrollLeft; }

    function saveAccount() {
      const e = $('accEmail').value.trim(), k = $('accKey').value.trim();
      if(!e||!k) return notify('Email and API Key are required.', true);
      accounts.push({email:e, key:k});
      localStorage.setItem('cf_accounts_v2', JSON.stringify(accounts));
      $('accEmail').value = ''; $('accKey').value = '';
      $('addAccForm').style.display='none';
      updAccs();
      notify('Account saved.');
    }
    
    function deleteAccount() {
      const i = $('accSelector').value;
      if(i === "-1") return;
      if(confirm('Remove this account?')) {
        accounts.splice(i, 1);
        localStorage.setItem('cf_accounts_v2', JSON.stringify(accounts));
        updAccs();
        notify('Account removed.');
      }
    }
    
    function switchAccount() {
      const i = $('accSelector').value;
      if(i !== "-1" && accounts[i]) {
        currentAcc = accounts[i];
        $('statusBadge').style.display = 'inline-block';
        fetchList();
      } else {
        currentAcc = null;
        $('statusBadge').style.display='none';
        $('workerList').innerHTML = '<p class="text-center text-muted my-4">Select an account to view workers.</p>';
      }
    }
    
    function updAccs() {
      $('accSelector').innerHTML = accounts.map((a,i)=>\`<option value="\${i}">\${a.email}</option>\`).join('') || '<option value="-1">No accounts saved</option>';
      switchAccount();
    }

    class CfClient { constructor(e, k) { this.e = e; this.k = k; } async getAccounts() { const r = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: { "X-Auth-Email": this.e, "X-Auth-Key": this.k } }); return r.json(); } }

    updAccs();
    $('editor').onkeydown = function(e) { if(e.key === 'Tab') { e.preventDefault(); const s = this.selectionStart; this.value = this.value.substring(0, s) + "  " + this.value.substring(this.selectionEnd); this.selectionEnd = s + 2; updView(); } };
  </script>
</body>
</html>
    `;
    return new Response(html, { headers: { 'content-type': 'text/html;charset=UTF-8' } });
  }
};
