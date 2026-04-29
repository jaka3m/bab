import { connect } from "cloudflare:sockets";

const vmessUUID = "f282b878-8711-45a1-8c69-5564172123c1";
let proxyList = [];
let currentDomain = "";

// Fetch proxy list dari GitHub (format: IP,Port,Country,ISP)
async function fetchProxyList() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/jaka1m/botak/refs/heads/main/cek/proxyList.txt');
        const text = await response.text();
        
        // Parse format: IP,Port,Country,ISP
        proxyList = text.split('\n')
            .filter(line => line.trim() && line.includes(','))
            .map(line => {
                const [ip, port, country, isp] = line.split(',');
                return {
                    ip: ip.trim(),
                    port: port.trim(),
                    country: country?.trim() || 'Unknown',
                    isp: isp?.trim() || 'Unknown',
                    display: `${ip.trim()}:${port.trim()} (${country?.trim() || 'Unknown'} - ${isp?.trim() || 'Unknown'})`
                };
            });
        
        console.log(`Loaded ${proxyList.length} proxies`);
    } catch (error) {
        console.error('Failed to fetch proxy list:', error);
        proxyList = [];
    }
}

// Generate URL configurations dengan domain dinamis
function generateVMessURL(proxyIP, proxyPort, domain) {
    const config = {
        v: "2",
        ps: `${proxyIP}:${proxyPort} - VMess-TLS`,
        add: domain,
        port: 443,
        id: vmessUUID,
        aid: "0",
        net: "ws",
        type: "none",
        host: domain,
        path: `/Free-VPN-CF-Geo-Project/${proxyIP}=${proxyPort}`,
        tls: "tls",
        sni: domain,
        scy: "zero"
    };
    return "vmess://" + btoa(JSON.stringify(config));
}

function generateVLESSURL(proxyIP, proxyPort, domain) {
    const params = new URLSearchParams({
        encryption: "none",
        security: "tls",
        type: "ws",
        host: domain,
        path: `/Free-VPN-CF-Geo-Project/${proxyIP}=${proxyPort}`,
        sni: domain
    });
    return `vless://${vmessUUID}@${domain}:443?${params.toString()}#${proxyIP}:${proxyPort}%20-%20VLESS-TLS`;
}

function generateTrojanURL(proxyIP, proxyPort, domain) {
    const trojanPassword = "d3b97f74-c75f-4129-8f17-92f9094bde3b";
    const params = new URLSearchParams({
        security: "tls",
        type: "ws",
        host: domain,
        path: `/Free-VPN-CF-Geo-Project/${proxyIP}=${proxyPort}`,
        sni: domain
    });
    return `trojan://${trojanPassword}@${domain}:443?${params.toString()}#${proxyIP}:${proxyPort}%20-%20Trojan-TLS`;
}

// HTML UI Component dengan domain dinamis
function generateHTML(domain, proxyCount) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VPN Configuration Manager - ${domain}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .domain-info {
            background: rgba(255,255,255,0.2);
            border-radius: 10px;
            padding: 10px;
            margin-top: 15px;
            font-size: 0.9em;
        }

        .proxy-section {
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .proxy-section h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.5em;
        }

        .proxy-selector {
            display: flex;
            gap: 15px;
            align-items: center;
            flex-wrap: wrap;
        }

        select {
            flex: 1;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s;
        }

        select:focus {
            outline: none;
            border-color: #667eea;
        }

        button {
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }

        button:active {
            transform: translateY(0);
        }

        .stats {
            margin-top: 15px;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 8px;
            font-size: 14px;
            color: #666;
        }

        .config-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }

        .config-card {
            background: white;
            border-radius: 15px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transition: transform 0.3s;
        }

        .config-card:hover {
            transform: translateY(-5px);
        }

        .config-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }

        .config-title {
            font-size: 1.3em;
            font-weight: bold;
            color: #333;
        }

        .badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
        }

        .badge-vmess { background: #4CAF50; color: white; }
        .badge-vless { background: #2196F3; color: white; }
        .badge-trojan { background: #FF9800; color: white; }

        .url-container {
            background: #f5f5f5;
            border-radius: 8px;
            padding: 12px;
            margin: 15px 0;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 100px;
            overflow-y: auto;
        }

        .copy-btn {
            width: 100%;
            padding: 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: background 0.3s;
        }

        .copy-btn:hover {
            background: #45a049;
        }

        .copy-btn.copied {
            background: #2196F3;
        }

        .status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 8px;
            text-align: center;
            font-size: 14px;
        }

        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }

        @media (max-width: 768px) {
            .config-grid {
                grid-template-columns: 1fr;
            }
            
            .proxy-selector {
                flex-direction: column;
            }
            
            select, button {
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 VPN Configuration Manager</h1>
            <p>Generate VMess, VLess, and Trojan configurations with proxy routing</p>
            <div class="domain-info">
                🌐 Server Domain: <strong>${domain}</strong><br>
                📡 Path Format: <code>/Free-VPN-CF-Geo-Project/IP=PORT</code>
            </div>
        </div>

        <div class="proxy-section">
            <h2>🌐 Select Proxy Server</h2>
            <div class="proxy-selector">
                <select id="proxySelect">
                    <option value="">Loading proxies...</option>
                </select>
                <button onclick="refreshProxies()">🔄 Refresh Proxies</button>
            </div>
            <div class="stats" id="proxyStats"></div>
        </div>

        <div class="config-grid" id="configGrid">
            <div class="config-card">
                <div class="config-header">
                    <span class="config-title">VMess Configuration</span>
                    <span class="badge badge-vmess">VMess</span>
                </div>
                <div class="url-container" id="vmessUrl">Select a proxy to generate URL</div>
                <button class="copy-btn" onclick="copyToClipboard('vmess')">📋 Copy VMess URL</button>
            </div>

            <div class="config-card">
                <div class="config-header">
                    <span class="config-title">VLess Configuration</span>
                    <span class="badge badge-vless">VLess</span>
                </div>
                <div class="url-container" id="vlessUrl">Select a proxy to generate URL</div>
                <button class="copy-btn" onclick="copyToClipboard('vless')">📋 Copy VLess URL</button>
            </div>

            <div class="config-card">
                <div class="config-header">
                    <span class="config-title">Trojan Configuration</span>
                    <span class="badge badge-trojan">Trojan</span>
                </div>
                <div class="url-container" id="trojanUrl">Select a proxy to generate URL</div>
                <button class="copy-btn" onclick="copyToClipboard('trojan')">📋 Copy Trojan URL</button>
            </div>
        </div>

        <div id="status" class="status" style="display: none;"></div>
    </div>

    <script>
        let currentProxy = null;
        let proxyList = [];
        const currentDomain = window.location.hostname;

        async function loadProxies() {
            const select = document.getElementById('proxySelect');
            const statsDiv = document.getElementById('proxyStats');
            
            select.innerHTML = '<option value="">Loading proxies...</option>';
            statsDiv.innerHTML = '<div class="loading">⏳ Fetching proxy list from GitHub...</div>';
            
            try {
                const response = await fetch('/api/proxies');
                const proxies = await response.json();
                proxyList = proxies;
                
                if (proxies.length === 0) {
                    select.innerHTML = '<option value="">No proxies available</option>';
                    statsDiv.innerHTML = '<div class="loading">❌ No proxies found in the list</div>';
                    showStatus('No proxies found in the list', 'error');
                } else {
                    select.innerHTML = '<option value="">Select a proxy server...</option>';
                    proxies.forEach(proxy => {
                        const option = document.createElement('option');
                        option.value = proxy.ip + ':' + proxy.port;
                        option.textContent = proxy.display;
                        select.appendChild(option);
                    });
                    
                    statsDiv.innerHTML = '<div>✅ Loaded ' + proxies.length + ' proxies from GitHub</div>' +
                        '<div>📝 Format: IP:PORT (Country - ISP)</div>' +
                        '<div>🔗 Path: /Free-VPN-CF-Geo-Project/IP=PORT</div>';
                    
                    showStatus('Loaded ' + proxies.length + ' proxies successfully', 'success');
                }
            } catch (error) {
                console.error('Failed to load proxies:', error);
                select.innerHTML = '<option value="">Error loading proxies</option>';
                statsDiv.innerHTML = '<div class="loading">❌ Failed to load proxy list</div>';
                showStatus('Failed to load proxies', 'error');
            }
        }

        async function refreshProxies() {
            showStatus('Refreshing proxies...', 'info');
            await loadProxies();
        }

        async function generateConfigs() {
            const select = document.getElementById('proxySelect');
            const proxyValue = select.value;
            
            if (!proxyValue) {
                showStatus('Please select a proxy server first', 'error');
                return;
            }

            const [proxyIP, proxyPort] = proxyValue.split(':');
            currentProxy = { ip: proxyIP, port: proxyPort };
            
            showStatus('Generating configurations for ' + proxyIP + ':' + proxyPort + '...', 'info');
            
            try {
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proxyIP, proxyPort, domain: currentDomain })
                });
                
                const configs = await response.json();
                
                document.getElementById('vmessUrl').textContent = configs.vmess;
                document.getElementById('vlessUrl').textContent = configs.vless;
                document.getElementById('trojanUrl').textContent = configs.trojan;
                
                showStatus('Configurations generated successfully for ' + proxyIP + ':' + proxyPort + '!', 'success');
            } catch (error) {
                console.error('Failed to generate configs:', error);
                showStatus('Failed to generate configurations', 'error');
            }
        }

        async function copyToClipboard(type) {
            let url = '';
            switch(type) {
                case 'vmess':
                    url = document.getElementById('vmessUrl').textContent;
                    break;
                case 'vless':
                    url = document.getElementById('vlessUrl').textContent;
                    break;
                case 'trojan':
                    url = document.getElementById('trojanUrl').textContent;
                    break;
            }
            
            if (!url || url === 'Select a proxy to generate URL') {
                showStatus('Please generate configurations first', 'error');
                return;
            }
            
            try {
                await navigator.clipboard.writeText(url);
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = '✓ Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('copied');
                }, 2000);
                showStatus(type.toUpperCase() + ' URL copied to clipboard!', 'success');
            } catch (err) {
                showStatus('Failed to copy to clipboard', 'error');
            }
        }

        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.textContent = message;
            statusDiv.className = 'status ' + type;
            statusDiv.style.display = 'block';
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }

        document.getElementById('proxySelect').addEventListener('change', generateConfigs);
        
        // Load proxies on page load
        loadProxies();
    </script>
</body>
</html>`;
}

const str2arr = (str) => new TextEncoder().encode(str);
const arr2str = (arr) => new TextDecoder().decode(arr);
const concat = (...arrays) => {
    const result = new Uint8Array(arrays.reduce((sum, arr) => sum + arr.length, 0));
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
};
const alloc = (size, fill = 0) => {
    const arr = new Uint8Array(size);
    if (fill) arr.fill(fill);
    return arr;
};

const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY = str2arr("VMess Header AEAD Key_Length");
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV = str2arr("VMess Header AEAD Nonce_Length");
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_KEY = str2arr("VMess Header AEAD Key");
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_IV = str2arr("VMess Header AEAD Nonce");
const KDFSALT_CONST_AEAD_RESP_HEADER_LEN_KEY = str2arr("AEAD Resp Header Len Key");
const KDFSALT_CONST_AEAD_RESP_HEADER_LEN_IV = str2arr("AEAD Resp Header Len IV");
const KDFSALT_CONST_AEAD_RESP_HEADER_KEY = str2arr("AEAD Resp Header Key");
const KDFSALT_CONST_AEAD_RESP_HEADER_IV = str2arr("AEAD Resp Header IV");

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const DNS_PORT = 53;

const PROTOCOLS = {
    P1: atob('VHJvamFu'),
    P2: atob('VkxFU1M='),
    P3: atob('U2hhZG93c29ja3M='),
    P4: atob('Vk1lc3M=')
};

const DETECTION_PATTERNS = {
    DELIMITER_P1: [0x0d, 0x0a],
    DELIMITER_P1_CHECK: [0x01, 0x03, 0x7f],
    UUID_V4_REGEX: /^\w{8}\w{4}4\w{3}[89ab]\w{3}\w{12}$/,
    BUFFER_MIN_SIZE: 62,
    DELIMITER_OFFSET: 56
};

const ADDRESS_TYPES = {
    IPV4: 1,
    DOMAIN: 2,
    IPV6: 3,
    DOMAIN_ALT: 3
};
const COMMAND_TYPES = {
    TCP: 1,
    UDP: 2,
    UDP_ALT: 3
};

function sha256(message) {
    const msg = message instanceof Uint8Array ? message : str2arr(message);
    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    let H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const len = msg.length;
    const paddingLen = ((56 - (len + 1) % 64) + 64) % 64;
    const padded = new Uint8Array(len + 1 + paddingLen + 8);
    padded.set(msg);
    padded[len] = 0x80;
    new DataView(padded.buffer).setUint32(padded.length - 4, len * 8, false);
    const W = new Uint32Array(64);
    for (let i = 0; i < padded.length; i += 64) {
        const block = new DataView(padded.buffer, i, 64);
        for (let t = 0; t < 16; t++) W[t] = block.getUint32(t * 4, false);
        for (let t = 16; t < 64; t++) {
            const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
            const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
            W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const T2 = (S0 + maj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + T1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (T1 + T2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0;
        H[1] = (H[1] + b) >>> 0;
        H[2] = (H[2] + c) >>> 0;
        H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0;
        H[5] = (H[5] + f) >>> 0;
        H[6] = (H[6] + g) >>> 0;
        H[7] = (H[7] + h) >>> 0;
    }
    const result = new Uint8Array(32);
    const rv = new DataView(result.buffer);
    for (let i = 0; i < 8; i++) rv.setUint32(i * 4, H[i], false);
    return result;
}

function md5(data, salt) {
    let msg = data instanceof Uint8Array ? data : str2arr(data);
    if (salt) {
        const s = salt instanceof Uint8Array ? salt : str2arr(salt);
        msg = concat(msg, s);
    }
    const K = new Uint32Array([
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
    ]);
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    const len = msg.length;
    const paddingLen = ((56 - (len + 1) % 64) + 64) % 64;
    const padded = new Uint8Array(len + 1 + paddingLen + 8);
    padded.set(msg);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, (len * 8) >>> 0, true);
    view.setUint32(padded.length - 4, (len * 8 / 0x100000000) >>> 0, true);
    const rotl = (x, n) => (x << n) | (x >>> (32 - n));
    for (let i = 0; i < padded.length; i += 64) {
        const M = new Uint32Array(16);
        for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true);
        let [A, B, C, D] = [a0, b0, c0, d0];
        for (let j = 0; j < 64; j++) {
            let F, g;
            if (j < 16) {
                F = (B & C) | (~B & D);
                g = j;
            } else if (j < 32) {
                F = (D & B) | (~D & C);
                g = (5 * j + 1) % 16;
            } else if (j < 48) {
                F = B ^ C ^ D;
                g = (3 * j + 5) % 16;
            } else {
                F = C ^ (B | ~D);
                g = (7 * j) % 16;
            }
            F = (F + A + K[j] + M[g]) >>> 0;
            A = D;
            D = C;
            C = B;
            B = (B + rotl(F, S[j])) >>> 0;
        }
        a0 = (a0 + A) >>> 0;
        b0 = (b0 + B) >>> 0;
        c0 = (c0 + C) >>> 0;
        d0 = (d0 + D) >>> 0;
    }
    const result = new Uint8Array(16);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, a0, true);
    rv.setUint32(4, b0, true);
    rv.setUint32(8, c0, true);
    rv.setUint32(12, d0, true);
    return result;
}

function createRecursiveHash(key, underlyingHashFn) {
    const ipad = alloc(64, 0x36);
    const opad = alloc(64, 0x5c);
    const keyBuf = key instanceof Uint8Array ? key : str2arr(key);
    for (let i = 0; i < keyBuf.length; i++) {
        ipad[i] ^= keyBuf[i];
        opad[i] ^= keyBuf[i];
    }
    return (data) => underlyingHashFn(concat(opad, underlyingHashFn(concat(ipad, data))));
}

function kdf(key, path) {
    let fn = sha256;
    fn = createRecursiveHash(str2arr("VMess AEAD KDF"), fn);
    for (const p of path) fn = createRecursiveHash(p, fn);
    return fn(key);
}

function toBuffer(uuidStr) {
    const hex = uuidStr.replace(/-/g, '');
    const arr = new Uint8Array(16);
    for (let i = 0; i < 16; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    return arr;
}

async function aesGcmDecrypt(key, iv, data, aad) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, {
        name: 'AES-GCM'
    }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv,
            additionalData: aad || new Uint8Array(0),
            tagLength: 128
        },
        cryptoKey, data
    );
    return new Uint8Array(decrypted);
}

async function aesGcmEncrypt(key, iv, data, aad) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, {
        name: 'AES-GCM'
    }, false, ['encrypt']);
    const encrypted = await crypto.subtle.encrypt({
            name: 'AES-GCM',
            iv,
            additionalData: aad || new Uint8Array(0),
            tagLength: 128
        },
        cryptoKey, data
    );
    return new Uint8Array(encrypted);
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const domain = url.hostname;
        
        // API endpoint untuk mendapatkan daftar proxy
        if (url.pathname === '/api/proxies') {
            await fetchProxyList();
            return new Response(JSON.stringify(proxyList), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // API endpoint untuk generate konfigurasi
        if (url.pathname === '/api/generate' && request.method === 'POST') {
            const { proxyIP, proxyPort, domain: reqDomain } = await request.json();
            const activeDomain = reqDomain || domain;
            const configs = {
                vmess: generateVMessURL(proxyIP, proxyPort, activeDomain),
                vless: generateVLESSURL(proxyIP, proxyPort, activeDomain),
                trojan: generateTrojanURL(proxyIP, proxyPort, activeDomain)
            };
            return new Response(JSON.stringify(configs), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // WebSocket handler untuk koneksi proxy
        const upgradeHeader = request.headers.get("Upgrade");
        if (upgradeHeader === "websocket") {
            // Path format: /Free-VPN-CF-Geo-Project/IP=PORT
            const pathPattern = /^\/Free-VPN-CF-Geo-Project\/([^=]+)=(\d+)$/i;
            const match = url.pathname.match(pathPattern);
            
            if (match) {
                const proxyIP = match[1];
                const proxyPort = match[2];
                globalThis.pxip = `${proxyIP}:${proxyPort}`;
                return await websocketHandler(request);
            }
            
            // Fallback untuk format lama
            const oldMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);
            if (oldMatch) {
                globalThis.pxip = oldMatch[1].replace(/[=-]/, ':');
                return await websocketHandler(request);
            }
        }
        
        // Tampilkan UI untuk route root
        if (url.pathname === '/' || url.pathname === '') {
            return new Response(generateHTML(domain, proxyList.length), {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        return new Response("Not Found", { status: 404 });
    },
};

async function websocketHandler(request) {
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);
    webSocket.accept();

    let addressLog = "",
        portLog = "";
    const log = (info, event) => console.log(`[${addressLog}:${portLog}] ${info}`, event || "");

    const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
    const readableWebSocketStream = createReadableWebSocketStream(webSocket, earlyDataHeader, log);

    let remoteSocketWrapper = {
        value: null
    };
    let udpStreamWrite = null,
        isDNS = false;

    readableWebSocketStream.pipeTo(new WritableStream({
        async write(chunk, controller) {
            if (isDNS && udpStreamWrite) return udpStreamWrite(chunk);
            if (remoteSocketWrapper.value) {
                const writer = remoteSocketWrapper.value.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }

            const bufferChunk = new Uint8Array(chunk);
            const protocol = await detectProtocol(bufferChunk);
            let protocolHeader;

            if (protocol === PROTOCOLS.P1) protocolHeader = parseP1Header(bufferChunk);
            else if (protocol === PROTOCOLS.P2) protocolHeader = parseP2Header(bufferChunk);
            else if (protocol === PROTOCOLS.P4) protocolHeader = await parseP4Header(bufferChunk);
            else if (protocol === PROTOCOLS.P3) protocolHeader = parseP3Header(bufferChunk);
            else {
                parseUnknownHeader(bufferChunk);
                throw new Error("Unknown Protocol!");
            }

            addressLog = protocolHeader.addressRemote;
            portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? "UDP" : "TCP"}`;
            if (protocolHeader.hasError) throw new Error(protocolHeader.message);

            if (protocolHeader.isUDP) {
                if (protocolHeader.portRemote === DNS_PORT) isDNS = true;
                else throw new Error("UDP only support for DNS port 53");
            }

            if (isDNS) {
                const {
                    write
                } = await handleUDPOutbound(webSocket, protocolHeader.version, log);
                udpStreamWrite = write;
                udpStreamWrite(protocolHeader.rawClientData);
                return;
            }

            handleTCPOutbound(remoteSocketWrapper, protocolHeader.addressRemote, protocolHeader.portRemote,
                protocolHeader.rawClientData, webSocket, protocolHeader.version, log);
        },
        close() {
            log(`readableWebSocketStream closed`);
        },
        abort(reason) {
            log(`readableWebSocketStream aborted`, JSON.stringify(reason));
        },
    })).catch((err) => log("pipeTo error", err));

    return new Response(null, {
        status: 101,
        webSocket: client
    });
}

async function detectProtocol(buffer) {
    if (await isVMess(buffer)) return PROTOCOLS.P4;
    if (buffer.byteLength >= DETECTION_PATTERNS.BUFFER_MIN_SIZE) {
        const delimiter = buffer.slice(DETECTION_PATTERNS.DELIMITER_OFFSET, DETECTION_PATTERNS.DELIMITER_OFFSET + 4);
        if (delimiter[0] === DETECTION_PATTERNS.DELIMITER_P1[0] && delimiter[1] === DETECTION_PATTERNS.DELIMITER_P1[1]) {
            if (DETECTION_PATTERNS.DELIMITER_P1_CHECK.includes(delimiter[2]) &&
                DETECTION_PATTERNS.DELIMITER_P1_CHECK.concat([0x04]).includes(delimiter[3])) return PROTOCOLS.P1;
        }
    }
    const uuidCheck = buffer.slice(1, 17);
    const hexString = arrayBufferToHex(uuidCheck.buffer);
    if (DETECTION_PATTERNS.UUID_V4_REGEX.test(hexString)) return PROTOCOLS.P2;

    return PROTOCOLS.P3;
}

async function isVMess(buffer) {
    if (buffer.length < 42) return false;
    try {
        const uuidBytes = toBuffer(vmessUUID);
        const auth_id = buffer.subarray(0, 16);
        const len_encrypted = buffer.subarray(16, 34);
        const nonce = buffer.subarray(34, 42);
        const key = md5(uuidBytes, str2arr("c48619fe-8f02-49e0-b9e9-edf763e17e21"));
        const header_length_key = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY, auth_id, nonce]).subarray(0, 16);
        const header_length_nonce = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV, auth_id, nonce]).subarray(0, 12);
        const decryptedLen = await aesGcmDecrypt(header_length_key, header_length_nonce, len_encrypted, auth_id);
        const header_length = (decryptedLen[0] << 8) | decryptedLen[1];
        return header_length > 0 && header_length < 4096;
    } catch (e) {
        return false;
    }
}

async function parseP4Header(buffer) {
    const uuidBytes = toBuffer(vmessUUID);
    if (buffer.length < 16) throw new Error("Data too short for VMess AuthID");
    const auth_id = buffer.subarray(0, 16);
    let remaining = buffer.subarray(16);

    if (remaining.length < 18) throw new Error("Data too short for VMess LenEnc");
    const len_encrypted = remaining.subarray(0, 18);
    remaining = remaining.subarray(18);

    if (remaining.length < 8) throw new Error("Data too short for VMess Nonce");
    const nonce = remaining.subarray(0, 8);
    remaining = remaining.subarray(8);

    const key = md5(uuidBytes, str2arr("c48619fe-8f02-49e0-b9e9-edf763e17e21"));
    const mainKey = key;

    const header_length_key = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY, auth_id, nonce]).subarray(0, 16);
    const header_length_nonce = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV, auth_id, nonce]).subarray(0, 12);

    const decryptedLen = await aesGcmDecrypt(header_length_key, header_length_nonce, len_encrypted, auth_id);
    const header_length = (decryptedLen[0] << 8) | decryptedLen[1];

    if (remaining.length < header_length + 16) throw new Error("Data too short for VMess Cmd");
    const cmd_encrypted = remaining.subarray(0, header_length + 16);
    const rawClientData = remaining.subarray(header_length + 16);

    const payload_key = kdf(mainKey, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_KEY, auth_id, nonce]).subarray(0, 16);
    const payload_nonce = kdf(mainKey, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_IV, auth_id, nonce]).subarray(0, 12);
    const cmdBuf = await aesGcmDecrypt(payload_key, payload_nonce, cmd_encrypted, auth_id);

    if (cmdBuf[0] !== 1) throw new Error("Invalid VMess version");
    const iv = cmdBuf.subarray(1, 17);
    const keyResp = cmdBuf.subarray(17, 33);
    const responseAuth = cmdBuf[33];
    const command = cmdBuf[37];
    const portRemote = (cmdBuf[38] << 8) | cmdBuf[39];
    const addrType = cmdBuf[40];
    let addrEnd = 41,
        addressRemote = "";

    if (addrType === 1) {
        addressRemote = `${cmdBuf[41]}.${cmdBuf[42]}.${cmdBuf[43]}.${cmdBuf[44]}`;
        addrEnd += 4;
    } else if (addrType === 2) {
        const len = cmdBuf[41];
        addressRemote = arr2str(cmdBuf.subarray(42, 42 + len));
        addrEnd += 1 + len;
    } else if (addrType === 3) {
        const parts = [];
        for (let i = 0; i < 8; i++) parts.push(((cmdBuf[41 + i * 2] << 8) | cmdBuf[41 + i * 2 + 1]).toString(16));
        addressRemote = parts.join(':');
        addrEnd += 16;
    }

    const respKeyBase = sha256(keyResp).subarray(0, 16);
    const respIvBase = sha256(iv).subarray(0, 16);

    const length_key = kdf(respKeyBase, [KDFSALT_CONST_AEAD_RESP_HEADER_LEN_KEY]).subarray(0, 16);
    const length_iv = kdf(respIvBase, [KDFSALT_CONST_AEAD_RESP_HEADER_LEN_IV]).subarray(0, 12);
    const encryptedLength = await aesGcmEncrypt(length_key, length_iv, new Uint8Array([0, 4]));

    const payload_key_resp = kdf(respKeyBase, [KDFSALT_CONST_AEAD_RESP_HEADER_KEY]).subarray(0, 16);
    const payload_iv_resp = kdf(respIvBase, [KDFSALT_CONST_AEAD_RESP_HEADER_IV]).subarray(0, 12);
    const encryptedHeaderPayload = await aesGcmEncrypt(payload_key_resp, payload_iv_resp, new Uint8Array([responseAuth, 0, 0, 0]));

    return {
        hasError: false,
        addressRemote,
        portRemote,
        rawClientData,
        version: concat(encryptedLength, encryptedHeaderPayload),
        isUDP: portRemote === DNS_PORT
    };
}

function parseP3Header(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const addressType = view.getUint8(0);
    let addressLength = 0,
        addressValueIndex = 1,
        addressValue = "";

    switch (addressType) {
        case ADDRESS_TYPES.IPV4:
            addressLength = 4;
            addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
            break;
        case ADDRESS_TYPES.DOMAIN_ALT:
            addressLength = buffer[addressValueIndex];
            addressValueIndex += 1;
            addressValue = arr2str(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
            break;
        case ADDRESS_TYPES.IPV6:
            addressLength = 16;
            const dv = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength).buffer);
            const ipv6 = [];
            for (let i = 0; i < 8; i++) ipv6.push(dv.getUint16(i * 2).toString(16));
            addressValue = ipv6.join(":");
            break;
        default:
            return {
                hasError: true, message: `Invalid addressType for P3: ${addressType}`
            };
    }
    if (!addressValue) return {
        hasError: true,
        message: `Destination address empty`
    };

    const portIndex = addressValueIndex + addressLength;
    const portBuffer = buffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer.buffer, portBuffer.byteOffset, 2).getUint16(0);

    return {
        hasError: false,
        addressRemote: addressValue,
        addressType,
        portRemote,
        rawDataIndex: portIndex + 2,
        rawClientData: buffer.slice(portIndex + 2),
        version: null,
        isUDP: portRemote == DNS_PORT
    };
}

function parseP2Header(buffer) {
    const version = buffer[0];
    let isUDP = false;
    const optLength = buffer[17];
    const cmd = buffer[18 + optLength];

    if (cmd === COMMAND_TYPES.TCP) {} else if (cmd === COMMAND_TYPES.UDP) isUDP = true;
    else return {
        hasError: true,
        message: `Command ${cmd} not supported for P2`
    };

    const portIndex = 18 + optLength + 1;
    const portBuffer = buffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer.buffer, portBuffer.byteOffset, 2).getUint16(0);

    let addressIndex = portIndex + 2;
    const addressType = buffer[addressIndex];
    let addressLength = 0,
        addressValueIndex = addressIndex + 1,
        addressValue = "";

    switch (addressType) {
        case ADDRESS_TYPES.IPV4:
            addressLength = 4;
            addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
            break;
        case ADDRESS_TYPES.DOMAIN:
            addressLength = buffer[addressValueIndex];
            addressValueIndex += 1;
            addressValue = arr2str(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
            break;
        case ADDRESS_TYPES.IPV6:
            addressLength = 16;
            const dv = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength).buffer);
            const ipv6 = [];
            for (let i = 0; i < 8; i++) ipv6.push(dv.getUint16(i * 2).toString(16));
            addressValue = ipv6.join(":");
            break;
        default:
            return {
                hasError: true, message: `Invalid addressType: ${addressType}`
            };
    }
    if (!addressValue) return {
        hasError: true,
        message: `addressValue is empty`
    };

    return {
        hasError: false,
        addressRemote: addressValue,
        addressType,
        portRemote,
        rawDataIndex: addressValueIndex + addressLength,
        rawClientData: buffer.slice(addressValueIndex + addressLength),
        version: new Uint8Array([version, 0]),
        isUDP
    };
}

function parseP1Header(buffer) {
    const dataBuffer = buffer.slice(58);
    if (dataBuffer.byteLength < 6) return {
        hasError: true,
        message: "Invalid request data for P1"
    };

    let isUDP = false;
    const view = new DataView(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength);
    const cmd = view.getUint8(0);
    if (cmd == COMMAND_TYPES.UDP_ALT) isUDP = true;
    else if (cmd != COMMAND_TYPES.TCP) throw new Error("Unsupported command type for P1!");

    let addressType = view.getUint8(1);
    let addressLength = 0,
        addressValueIndex = 2,
        addressValue = "";

    switch (addressType) {
        case ADDRESS_TYPES.IPV4:
            addressLength = 4;
            addressValue = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
            break;
        case ADDRESS_TYPES.DOMAIN_ALT:
            addressLength = dataBuffer[addressValueIndex];
            addressValueIndex += 1;
            addressValue = arr2str(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
            break;
        case ADDRESS_TYPES.IPV6:
            addressLength = 16;
            const dv = new DataView(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength).buffer);
            const ipv6 = [];
            for (let i = 0; i < 8; i++) ipv6.push(dv.getUint16(i * 2).toString(16));
            addressValue = ipv6.join(":");
            break;
        default:
            return {
                hasError: true, message: `Invalid addressType: ${addressType}`
            };
    }
    if (!addressValue) return {
        hasError: true,
        message: `Address is empty`
    };

    const portIndex = addressValueIndex + addressLength;
    const portBuffer = dataBuffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer.buffer, portBuffer.byteOffset, 2).getUint16(0);

    return {
        hasError: false,
        addressRemote: addressValue,
        addressType,
        portRemote,
        rawDataIndex: portIndex + 4,
        rawClientData: dataBuffer.slice(portIndex + 4),
        version: null,
        isUDP
    };
}

async function remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry, log) {
    let header = responseHeader,
        hasIncomingData = false;
    await remoteSocket.readable.pipeTo(new WritableStream({
        async write(chunk, controller) {
            hasIncomingData = true;
            if (webSocket.readyState !== WS_READY_STATE_OPEN) controller.error("webSocket closed");
            if (header) {
                webSocket.send(await new Blob([header, chunk]).arrayBuffer());
                header = null;
            } else webSocket.send(chunk);
        },
        close() {
            log(`remoteConnection readable closed, hasData: ${hasIncomingData}`);
        },
        abort(reason) {
            console.error(`remoteConnection abort`, reason);
        },
    })).catch((error) => {
        console.error(`remoteSocketToWS error`, error.stack || error);
        safeCloseWebSocket(webSocket);
    });
    if (!hasIncomingData && retry) {
        log(`retrying`);
        retry();
    }
}

async function handleTCPOutbound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader, log) {
    async function connectAndWrite(address, port) {
        const tcpSocket = connect({
            hostname: address,
            port
        });
        remoteSocket.value = tcpSocket;
        log(`connected to ${address}:${port}`);
        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawClientData);
        writer.releaseLock();
        return tcpSocket;
    }
    async function retry() {
        // Pemisahan IP dan Port dari globalThis.pxip (format ip:port)
        const parts = globalThis.pxip?.split(':') || [];
        const tcpSocket = await connectAndWrite(
            parts[0] || addressRemote,
            parseInt(parts[1]) || portRemote
        );
        tcpSocket.closed.catch(e => console.log("retry closed error", e)).finally(() => safeCloseWebSocket(webSocket));
        remoteSocketToWS(tcpSocket, webSocket, responseHeader, null, log);
    }
    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
    remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry, log);
}

function createReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
    let readableStreamCancel = false;
    return new ReadableStream({
        start(controller) {
            webSocketServer.addEventListener("message", (e) => {
                if (!readableStreamCancel) controller.enqueue(e.data);
            });
            webSocketServer.addEventListener("close", () => {
                safeCloseWebSocket(webSocketServer);
                if (!readableStreamCancel) controller.close();
            });
            webSocketServer.addEventListener("error", (err) => {
                log("ws error");
                controller.error(err);
            });
            const {
                earlyData,
                error
            } = base64ToArrayBuffer(earlyDataHeader);
            if (error) controller.error(error);
            else if (earlyData) controller.enqueue(earlyData);
        },
        cancel(reason) {
            if (!readableStreamCancel) {
                log(`Stream canceled: ${reason}`);
                readableStreamCancel = true;
                safeCloseWebSocket(webSocketServer);
            }
        },
    });
}

function parseUnknownHeader(buffer) {}

function base64ToArrayBuffer(base64Str) {
    if (!base64Str) return {
        error: null
    };
    try {
        const decode = atob(base64Str.replace(/-/g, "+").replace(/_/g, "/"));
        return {
            earlyData: Uint8Array.from(decode, c => c.charCodeAt(0)).buffer,
            error: null
        };
    } catch (error) {
        return {
            error
        };
    }
}

function arrayBufferToHex(buffer) {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function handleUDPOutbound(webSocket, responseHeader, log) {
    let isHeaderSent = false;
    const transformStream = new TransformStream({
        transform(chunk, controller) {
            for (let index = 0; index < chunk.byteLength;) {
                const lengthBuffer = chunk.slice(index, index + 2);
                const udpPacketLength = new DataView(lengthBuffer.buffer, lengthBuffer.byteOffset, 2).getUint16(0);
                controller.enqueue(new Uint8Array(chunk.slice(index + 2, index + 2 + udpPacketLength)));
                index += 2 + udpPacketLength;
            }
        },
    });

    transformStream.readable.pipeTo(new WritableStream({
        async write(chunk) {
            const resp = await fetch("https://1.1.1.1/dns-query", {
                method: "POST",
                headers: {
                    "content-type": "application/dns-message"
                },
                body: chunk
            });
            const dnsQueryResult = await resp.arrayBuffer();
            const udpSize = dnsQueryResult.byteLength;
            const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
            if (webSocket.readyState === WS_READY_STATE_OPEN) {
                log(`DoH success, DNS length: ${udpSize}`);
                if (isHeaderSent) webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
                else {
                    webSocket.send(await new Blob([responseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
                    isHeaderSent = true;
                }
            }
        },
    })).catch(e => log("DNS UDP error: " + e));

    const writer = transformStream.writable.getWriter();
    return {
        write(chunk) {
            writer.write(chunk);
        }
    };
}

function safeCloseWebSocket(socket) {
    try {
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) socket.close();
    } catch (e) {
        console.error("safeCloseWebSocket error", e);
    }
}
