// Cloudflare Workers - Deploy Worker with Configurable GitHub URL
const CF_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_WORKER_TEMPLATE_URL = "https://raw.githubusercontent.com/jaka3m/bab/refs/heads/main/bob.js";

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate UUID v4
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Sanitize worker name for Cloudflare
 */
function sanitizeWorkerName(workerName) {
  if (!workerName) {
    return `worker-${Date.now().toString(36)}`;
  }
  return workerName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

/**
 * Validate GitHub URL
 */
function validateGitHubUrl(url) {
  if (!url) return DEFAULT_WORKER_TEMPLATE_URL;
  
  const urlObj = new URL(url);
  if (!urlObj.protocol.startsWith('http')) {
    throw new Error('URL must use HTTP/HTTPS protocol');
  }
  return url;
}

/**
 * Generate multipart form data for worker upload
 */
function generateFormData(workerCode, uuid, compatibilityDate = "2024-12-03") {
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  
  const metadata = {
    compatibility_date: compatibilityDate,
    compatibility_flags: ["nodejs_compat"],
    main_module: "worker.js"
  };

  const updatedWorkerCode = workerCode.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    uuid
  );

  const parts = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    'Content-Type: application/javascript+module',
    '',
    updatedWorkerCode,
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"',
    'Content-Type: application/json',
    '',
    JSON.stringify(metadata),
    `--${boundary}--`,
    ''
  ];

  return {
    body: parts.join('\r\n'),
    boundary
  };
}

/**
 * Generate configuration links for various protocols
 */
function generateConfigs(workerName, subdomain, uuid) {
  const host = `${workerName}.${subdomain}.workers.dev`;
  const mainDomain = "suporte.garena.com";
  const path = "%2FALL1";
  
  return {
    sub: `https://${host}/sub`,
    vless: `vless://${uuid}@${mainDomain}:443?encryption=none&security=tls&sni=${host}&fp=randomized&type=ws&host=${host}&path=${path}#${workerName}`,
    trojan: `trojan://${uuid}@${mainDomain}:443?sni=${host}&type=ws&host=${host}&path=${path}#${workerName}`
  };
}

// ==================== CLOUDFLARE API CLIENT ====================

class CfClient {
  constructor(email, globalAPIKey) {
    this.email = email;
    this.globalAPIKey = globalAPIKey;
  }

  async _fetch(path, options = {}) {
    const url = `${CF_BASE_URL}${path}`;
    
    // Build headers separately to avoid mutation issues
    const headers = {
      "X-Auth-Email": this.email,
      "X-Auth-Key": this.globalAPIKey,
      "User-Agent": "Worker-Deployer/1.0"
    };
    
    // Merge with custom headers from options
    if (options.headers) {
      Object.assign(headers, options.headers);
    }
    
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CF API Error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  async getAccountId() {
    const data = await this._fetch("/accounts");
    if (!data.result?.length) {
      throw new Error('No Cloudflare accounts found');
    }
    return data.result[0].id;
  }

  async getOrCreateSubdomain(accountId) {
    try {
      const data = await this._fetch(`/accounts/${accountId}/workers/subdomain`);
      return data.result.subdomain;
    } catch (error) {
      if (!error.message.includes('404')) throw error;
      
      const subdomainName = this.email.split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      
      const response = await this._fetch(`/accounts/${accountId}/workers/subdomain`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: subdomainName })
      });
      return response.result.subdomain;
    }
  }

  async deployWorker(workerName, formData) {
    const accountId = await this.getAccountId();
    const subdomain = await this.getOrCreateSubdomain(accountId);

    // Upload worker
    await this._fetch(
      `/accounts/${accountId}/workers/services/${workerName}/environments/production`,
      {
        method: 'PUT',
        body: formData.body,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${formData.boundary}`,
        },
      }
    );

    // Enable subdomain access
    await this._fetch(
      `/accounts/${accountId}/workers/services/${workerName}/environments/production/subdomain`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      }
    );

    return { workerName, accountId, subdomain };
  }
}

// ==================== REQUEST HANDLER ====================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const body = await request.json();
      const { email, globalAPIKey, workerName, githubUrl } = validateInput(body);
      const uuid = generateUUID();

      console.log(`Deploying worker: ${workerName}`);
      console.log(`Using template: ${githubUrl}`);

      // Fetch worker template
      const workerCode = await fetchWorkerTemplate(githubUrl);
      
      // Deploy to Cloudflare
      const formData = generateFormData(workerCode, uuid);
      const client = new CfClient(email, globalAPIKey);
      const result = await client.deployWorker(workerName, formData);
      
      // Generate response
      const configs = generateConfigs(result.workerName, result.subdomain, uuid);

      return new Response(
        JSON.stringify({
          success: true,
          ...configs,
          githubUrl
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      console.error('Deployment error:', error.message);
      
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
};

// ==================== HELPER FUNCTIONS ====================

async function fetchWorkerTemplate(githubUrl) {
  const response = await fetch(githubUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch template: ${response.status}`);
  }
  return response.text();
}

function validateInput(body) {
  const { email, globalAPIKey, workerName, githubUrl } = body;
  
  if (!email || !globalAPIKey) {
    throw new Error('Missing required: email, globalAPIKey');
  }
  if (!email.includes('@')) {
    throw new Error('Invalid email format');
  }
  if (globalAPIKey.length < 10) {
    throw new Error('Invalid API key');
  }

  return {
    email: email.trim(),
    globalAPIKey: globalAPIKey.trim(),
    workerName: sanitizeWorkerName(workerName),
    githubUrl: validateGitHubUrl(githubUrl)
  };
}
