import { connect } from "cloudflare:sockets";

const vmessUUID = "f282b878-8711-45a1-8c69-5564172123c1";
let proxyList = [];

// Fetch proxy list dari GitHub (format: IP,Port,Country,ISP)
async function fetchProxyList() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/jaka1m/botak/refs/heads/main/cek/proxyList.txt');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        
        // Parse format: IP,Port,Country,ISP
        proxyList = text.split('\n')
            .filter(line => line.trim() && line.includes(','))
            .map(line => {
                const parts = line.split(',');
                const ip = parts[0]?.trim() || '';
                const port = parts[1]?.trim() || '';
                const country = parts[2]?.trim() || 'Unknown';
                const isp = parts[3]?.trim() || 'Unknown';
                return {
                    ip,
                    port,
                    country,
                    isp,
                    display: `${ip}:${port} (${country} - ${isp})`
                };
            })
            .filter(p => p.ip && p.port);
        
        console.log(`Loaded ${proxyList.length} proxies`);
    } catch (error) {
        console.error('Failed to fetch proxy list:', error);
        proxyList = [];
    }
}

// Generate URL configurations
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
    try {
        return "vmess://" + btoa(JSON.stringify(config));
    } catch (e) {
        return "Error generating VMess URL";
    }
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

// HTML UI Component
function generateHTML(domain) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VPN Config Manager - ${domain}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: sans-serif; background: #f0f2f5; padding: 20px; color: #333; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #1a73e8; margin-bottom: 10px; text-align: center; }
        .info { background: #e8f0fe; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 0.9em; line-height: 1.5; }
        .section { margin-bottom: 25px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; }
        select { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 16px; margin-bottom: 10px; }
        .btn-group { display: flex; gap: 10px; }
        button { flex: 1; padding: 12px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: opacity 0.2s; }
        .btn-primary { background: #1a73e8; color: white; }
        .btn-secondary { background: #5f6368; color: white; }
        button:hover { opacity: 0.9; }
        .config-card { border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #fafafa; }
        .config-card h3 { margin-bottom: 10px; font-size: 1.1em; display: flex; justify-content: space-between; align-items: center; }
        .badge { font-size: 0.7em; padding: 4px 8px; border-radius: 4px; color: white; }
        .badge-vmess { background: #34a853; }
        .badge-vless { background: #4285f4; }
        .badge-trojan { background: #fbbc05; }
        .url-box { background: #eee; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; word-break: break-all; max-height: 80px; overflow-y: auto; margin-bottom: 10px; border: 1px solid #ddd; }
        .copy-btn { width: auto; padding: 6px 12px; font-size: 12px; }
        #status { text-align: center; margin-top: 20px; padding: 10px; border-radius: 6px; display: none; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 VPN Config Manager</h1>
        <div class="info">
            Domain: <strong>${domain}</strong><br>
            Pilih proxy dari daftar di bawah untuk menghasilkan konfigurasi VMess, VLess, atau Trojan.
        </div>

        <div class="section">
            <label for="proxySelect">Pilih Proxy Server:</label>
            <select id="proxySelect">
                <option value="">Memuat daftar proxy...</option>
            </select>
            <div class="btn-group">
                <button class="btn-secondary" onclick="loadProxies()">🔄 Refresh Daftar</button>
            </div>
        </div>

        <div id="configs" style="display: none;">
            <div class="config-card">
                <h3>VMess <span class="badge badge-vmess">VMess</span></h3>
                <div class="url-box" id="vmessUrl"></div>
                <button class="btn-primary copy-btn" onclick="copyToClipboard('vmess', event)">📋 Salin VMess</button>
            </div>
            <div class="config-card">
                <h3>VLess <span class="badge badge-vless">VLess</span></h3>
                <div class="url-box" id="vlessUrl"></div>
                <button class="btn-primary copy-btn" onclick="copyToClipboard('vless', event)">📋 Salin VLess</button>
            </div>
            <div class="config-card">
                <h3>Trojan <span class="badge badge-trojan">Trojan</span></h3>
                <div class="url-box" id="trojanUrl"></div>
                <button class="btn-primary copy-btn" onclick="copyToClipboard('trojan', event)">📋 Salin Trojan</button>
            </div>
        </div>

        <div id="status"></div>
    </div>

    <script>
        const proxySelect = document.getElementById('proxySelect');
        const configsDiv = document.getElementById('configs');
        const currentDomain = window.location.hostname;

        async function loadProxies() {
            showStatus('Memuat daftar proxy...', '');
            proxySelect.innerHTML = '<option value="">Memuat...</option>';
            try {
                const response = await fetch('/api/proxies');
                const proxies = await response.json();
                proxySelect.innerHTML = '<option value="">-- Pilih Proxy --</option>';
                proxies.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.ip + ':' + p.port;
                    opt.textContent = p.display;
                    proxySelect.appendChild(opt);
                });
                showStatus('Berhasil memuat ' + proxies.length + ' proxy', 'success');
            } catch (e) {
                showStatus('Gagal memuat proxy', 'error');
                proxySelect.innerHTML = '<option value="">Gagal memuat daftar</option>';
            }
        }

        proxySelect.onchange = async () => {
            const val = proxySelect.value;
            if (!val) {
                configsDiv.style.display = 'none';
                return;
            }
            const [ip, port] = val.split(':');
            try {
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proxyIP: ip, proxyPort: port, domain: currentDomain })
                });
                const data = await response.json();
                document.getElementById('vmessUrl').textContent = data.vmess;
                document.getElementById('vlessUrl').textContent = data.vless;
                document.getElementById('trojanUrl').textContent = data.trojan;
                configsDiv.style.display = 'block';
            } catch (e) {
                showStatus('Gagal membuat konfigurasi', 'error');
            }
        };

        async function copyToClipboard(id, event) {
            const text = document.getElementById(id + 'Url').textContent;
            try {
                await navigator.clipboard.writeText(text);
                const btn = event.target;
                const oldText = btn.textContent;
                btn.textContent = '✅ Tersalin!';
                setTimeout(() => btn.textContent = oldText, 2000);
            } catch (err) {
                alert('Gagal menyalin');
            }
        }

        function showStatus(msg, type) {
            const s = document.getElementById('status');
            s.textContent = msg;
            s.className = type;
            s.style.display = 'block';
            if (type === 'success') setTimeout(() => s.style.display = 'none', 3000);
        }

        loadProxies();
    </script>
</body>
</html>`;
}

// Utility functions
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

// VMess constants
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY = str2arr("VMess Header AEAD Key_Length");
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV = str2arr("VMess Header AEAD Nonce_Length");
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_KEY = str2arr("VMess Header AEAD Key");
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_IV = str2arr("VMess Header AEAD Nonce");
const KDFSALT_CONST_AEAD_RESP_HEADER_LEN_KEY = str2arr("AEAD Resp Header Len Key");
const KDFSALT_CONST_AEAD_RESP_HEADER_LEN_IV = str2arr("AEAD Resp Header Len IV");
const KDFSALT_CONST_AEAD_RESP_HEADER_KEY = str2arr("AEAD Resp Header Key");
const KDFSALT_CONST_AEAD_RESP_HEADER_IV = str2arr("AEAD Resp Header IV");

const PROTOCOLS = {
    P1: 'Trojan',
    P2: 'VLESS',
    P3: 'Shadowsocks',
    P4: 'VMess'
};

const ADDRESS_TYPES = { IPV4: 1, DOMAIN: 2, IPV6: 3, DOMAIN_ALT: 3 };
const COMMAND_TYPES = { TCP: 1, UDP: 2, UDP_ALT: 3 };

// Crypto functions
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
            h = g; g = f; f = e; e = (d + T1) >>> 0;
            d = c; c = b; b = a; a = (T1 + T2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const result = new Uint8Array(32);
    const rv = new DataView(result.buffer);
    for (let i = 0; i < 8; i++) rv.setUint32(i * 4, H[i], false);
    return result;
}

function md5(data, salt) {
    let msg = data instanceof Uint8Array ? data : str2arr(data);
    if (salt) msg = concat(msg, salt instanceof Uint8Array ? salt : str2arr(salt));
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
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
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
            if (j < 16) { F = (B & C) | (~B & D); g = j; }
            else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
            else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * j) % 16; }
            F = (F + A + K[j] + M[g]) >>> 0;
            A = D; D = C; C = B; B = (B + rotl(F, S[j])) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const result = new Uint8Array(16);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, a0, true); rv.setUint32(4, b0, true); rv.setUint32(8, c0, true); rv.setUint32(12, d0, true);
    return result;
}

function createRecursiveHash(key, underlyingHashFn) {
    const ipad = alloc(64, 0x36), opad = alloc(64, 0x5c);
    const keyBuf = key instanceof Uint8Array ? key : str2arr(key);
    for (let i = 0; i < keyBuf.length; i++) { ipad[i] ^= keyBuf[i]; opad[i] ^= keyBuf[i]; }
    return (data) => underlyingHashFn(concat(opad, underlyingHashFn(concat(ipad, data))));
}

function kdf(key, path) {
    let fn = createRecursiveHash(str2arr("VMess AEAD KDF"), sha256);
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
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad || new Uint8Array(0), tagLength: 128 }, cryptoKey, data));
}

async function aesGcmEncrypt(key, iv, data, aad) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad || new Uint8Array(0), tagLength: 128 }, cryptoKey, data));
}

// Main handler
export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const domain = url.hostname;

            if (url.pathname === '/api/proxies') {
                await fetchProxyList();
                return new Response(JSON.stringify(proxyList), { headers: { 'Content-Type': 'application/json' } });
            }

            if (url.pathname === '/api/generate' && request.method === 'POST') {
                const body = await request.json();
                const { proxyIP, proxyPort, domain: reqDomain } = body;
                const activeDomain = reqDomain || domain;
                const configs = {
                    vmess: generateVMessURL(proxyIP, proxyPort, activeDomain),
                    vless: generateVLESSURL(proxyIP, proxyPort, activeDomain),
                    trojan: generateTrojanURL(proxyIP, proxyPort, activeDomain)
                };
                return new Response(JSON.stringify(configs), { headers: { 'Content-Type': 'application/json' } });
            }

            const upgradeHeader = request.headers.get("Upgrade");
            if (upgradeHeader === "websocket") {
                const pathPattern = /^\/Free-VPN-CF-Geo-Project\/([^=]+)=(\d+)$/i;
                const match = url.pathname.match(pathPattern);
                let proxyIP = "", proxyPort = "";

                if (match) {
                    proxyIP = match[1];
                    proxyPort = match[2];
                } else {
                    const oldMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);
                    if (oldMatch) {
                        const parts = oldMatch[1].replace(/[=-]/, ':').split(':');
                        proxyIP = parts[0];
                        proxyPort = parts[1];
                    }
                }

                if (proxyIP && proxyPort) {
                    return await websocketHandler(request, proxyIP, proxyPort);
                }
            }

            if (url.pathname === '/' || url.pathname === '') {
                return new Response(generateHTML(domain), { headers: { 'Content-Type': 'text/html' } });
            }

            return new Response("Not Found", { status: 404 });
        } catch (err) {
            return new Response(`Internal Error: ${err.message}`, { status: 500 });
        }
    },
};

async function websocketHandler(request, proxyIP, proxyPort) {
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);
    webSocket.accept();

    const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
    const log = (info) => console.log(`[${proxyIP}:${proxyPort}] ${info}`);

    const readableWebSocketStream = createReadableWebSocketStream(webSocket, earlyDataHeader, log);
    let remoteSocketWrapper = { value: null };
    let udpStreamWrite = null, isDNS = false;

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
            const protocolHeader = await parseProtocol(bufferChunk);
            if (protocolHeader.hasError) throw new Error(protocolHeader.message);

            if (protocolHeader.isUDP && protocolHeader.portRemote === 53) {
                isDNS = true;
                const { write } = await handleUDPOutbound(webSocket, protocolHeader.version, log);
                udpStreamWrite = write;
                udpStreamWrite(protocolHeader.rawClientData);
                return;
            }

            await handleTCPOutbound(remoteSocketWrapper, protocolHeader.addressRemote, protocolHeader.portRemote,
                protocolHeader.rawClientData, webSocket, protocolHeader.version, proxyIP, proxyPort, log);
        },
        close() { log(`WS closed`); },
        abort(reason) { log(`WS aborted: ${reason}`); },
    })).catch((err) => log(`Pipe error: ${err.message}`));

    return new Response(null, { status: 101, webSocket: client });
}

async function parseProtocol(buffer) {
    // Basic detection logic
    if (await isVMess(buffer)) return await parseVMessHeader(buffer);
    if (buffer.length >= 62 && buffer[56] === 0x0d && buffer[57] === 0x0a) return parseTrojanHeader(buffer);
    const uuidCheck = buffer.slice(1, 17);
    if (/^\w{8}\w{4}4\w{3}[89ab]\w{3}\w{12}$/.test(arrayBufferToHex(uuidCheck.buffer))) return parseVlessHeader(buffer);
    return { hasError: true, message: "Unknown Protocol" };
}

async function isVMess(buffer) {
    if (buffer.length < 42) return false;
    try {
        const uuidBytes = toBuffer(vmessUUID);
        const auth_id = buffer.subarray(0, 16);
        const len_encrypted = buffer.subarray(16, 34);
        const nonce = buffer.subarray(34, 42);
        const key = md5(uuidBytes, str2arr("c48619fe-8f02-49e0-b9e9-edf763e17e21"));
        const h_key = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY, auth_id, nonce]).subarray(0, 16);
        const h_nonce = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV, auth_id, nonce]).subarray(0, 12);
        const decLen = await aesGcmDecrypt(h_key, h_nonce, len_encrypted, auth_id);
        const len = (decLen[0] << 8) | decLen[1];
        return len > 0 && len < 4096;
    } catch (e) { return false; }
}

async function parseVMessHeader(buffer) {
    const uuidBytes = toBuffer(vmessUUID);
    const auth_id = buffer.subarray(0, 16);
    const len_encrypted = buffer.subarray(16, 34);
    const nonce = buffer.subarray(34, 42);
    const key = md5(uuidBytes, str2arr("c48619fe-8f02-49e0-b9e9-edf763e17e21"));
    const h_key = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY, auth_id, nonce]).subarray(0, 16);
    const h_nonce = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV, auth_id, nonce]).subarray(0, 12);
    const decLen = await aesGcmDecrypt(h_key, h_nonce, len_encrypted, auth_id);
    const h_len = (decLen[0] << 8) | decLen[1];
    const cmd_encrypted = buffer.subarray(42, 42 + h_len + 16);
    const rawClientData = buffer.subarray(42 + h_len + 16);
    const p_key = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_KEY, auth_id, nonce]).subarray(0, 16);
    const p_nonce = kdf(key, [KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_IV, auth_id, nonce]).subarray(0, 12);
    const cmdBuf = await aesGcmDecrypt(p_key, p_nonce, cmd_encrypted, auth_id);
    const port = (cmdBuf[38] << 8) | cmdBuf[39];
    let address = "";
    if (cmdBuf[40] === 1) address = cmdBuf.subarray(41, 45).join('.');
    else if (cmdBuf[40] === 2) address = arr2str(cmdBuf.subarray(42, 42 + cmdBuf[41]));

    const r_key = sha256(cmdBuf.subarray(17, 33)).subarray(0, 16);
    const r_iv = sha256(cmdBuf.subarray(1, 17)).subarray(0, 16);
    const enc_l = await aesGcmEncrypt(kdf(r_key, [KDFSALT_CONST_AEAD_RESP_HEADER_LEN_KEY]).subarray(0, 16), kdf(r_iv, [KDFSALT_CONST_AEAD_RESP_HEADER_LEN_IV]).subarray(0, 12), new Uint8Array([0, 4]));
    const enc_h = await aesGcmEncrypt(kdf(r_key, [KDFSALT_CONST_AEAD_RESP_HEADER_KEY]).subarray(0, 16), kdf(r_iv, [KDFSALT_CONST_AEAD_RESP_HEADER_IV]).subarray(0, 12), new Uint8Array([cmdBuf[33], 0, 0, 0]));

    return { hasError: false, addressRemote: address, portRemote: port, rawClientData, version: concat(enc_l, enc_h), isUDP: port === 53 };
}

function parseVlessHeader(buffer) {
    const version = buffer[0];
    const optLength = buffer[17];
    const cmd = buffer[18 + optLength];
    const isUDP = cmd === 2;
    const port = (buffer[19 + optLength] << 8) | buffer[20 + optLength];
    let address = "";
    let addrIndex = 21 + optLength;
    const addrType = buffer[addrIndex];
    if (addrType === 1) { address = buffer.subarray(addrIndex + 1, addrIndex + 5).join('.'); addrIndex += 5; }
    else if (addrType === 2) { const len = buffer[addrIndex + 1]; address = arr2str(buffer.subarray(addrIndex + 2, addrIndex + 2 + len)); addrIndex += 2 + len; }
    return { hasError: false, addressRemote: address, portRemote: port, rawClientData: buffer.slice(addrIndex), version: new Uint8Array([version, 0]), isUDP };
}

function parseTrojanHeader(buffer) {
    const data = buffer.slice(58);
    const cmd = data[0];
    const isUDP = cmd === 3;
    const addrType = data[1];
    let address = "", addrIndex = 2;
    if (addrType === 1) { address = data.subarray(2, 6).join('.'); addrIndex = 6; }
    else if (addrType === 3) { const len = data[2]; address = arr2str(data.subarray(3, 3 + len)); addrIndex = 3 + len; }
    const port = (data[addrIndex] << 8) | data[addrIndex + 1];
    return { hasError: false, addressRemote: address, portRemote: port, rawClientData: data.slice(addrIndex + 4), version: null, isUDP };
}

async function handleTCPOutbound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader, proxyIP, proxyPort, log) {
    async function connectAndWrite(addr, port) {
        try {
            const socket = connect({ hostname: addr, port });
            const writer = socket.writable.getWriter();
            await writer.write(rawClientData);
            writer.releaseLock();
            return socket;
        } catch (e) {
            log(`Connect error: ${e.message}`);
            return null;
        }
    }

    let tcpSocket = await connectAndWrite(addressRemote, portRemote);
    if (!tcpSocket && proxyIP) {
        log(`Retrying via proxy ${proxyIP}:${proxyPort}`);
        tcpSocket = await connectAndWrite(proxyIP, parseInt(proxyPort));
    }

    if (tcpSocket) {
        remoteSocket.value = tcpSocket;
        let header = responseHeader;
        tcpSocket.readable.pipeTo(new WritableStream({
            write(chunk) {
                if (header) {
                    webSocket.send(concat(header, chunk));
                    header = null;
                } else webSocket.send(chunk);
            },
            close() { log(`Remote closed`); },
            abort(e) { log(`Remote abort: ${e}`); }
        })).catch(e => {
            log(`Remote pipe error: ${e.message}`);
            safeClose(webSocket);
        });
    } else {
        safeClose(webSocket);
    }
}

async function handleUDPOutbound(webSocket, responseHeader, log) {
    let isHeaderSent = false;
    const transformStream = new TransformStream({
        transform(chunk, controller) {
            for (let i = 0; i < chunk.byteLength;) {
                const len = (chunk[i] << 8) | chunk[i+1];
                controller.enqueue(chunk.slice(i + 2, i + 2 + len));
                i += 2 + len;
            }
        },
    });

    transformStream.readable.pipeTo(new WritableStream({
        async write(chunk) {
            try {
                const resp = await fetch("https://1.1.1.1/dns-query", { method: "POST", headers: { "content-type": "application/dns-message" }, body: chunk });
                const dns = await resp.arrayBuffer();
                const udpLen = new Uint8Array([(dns.byteLength >> 8) & 0xff, dns.byteLength & 0xff]);
                if (webSocket.readyState === 1) {
                    const data = isHeaderSent ? concat(udpLen, new Uint8Array(dns)) : concat(responseHeader, udpLen, new Uint8Array(dns));
                    webSocket.send(data);
                    isHeaderSent = true;
                }
            } catch (e) { log(`DNS error: ${e.message}`); }
        },
    }));

    const writer = transformStream.writable.getWriter();
    return { write(chunk) { writer.write(chunk); } };
}

function createReadableWebSocketStream(webSocket, earlyDataHeader, log) {
    return new ReadableStream({
        start(controller) {
            webSocket.addEventListener("message", (e) => controller.enqueue(e.data));
            webSocket.addEventListener("close", () => { safeClose(webSocket); controller.close(); });
            webSocket.addEventListener("error", (err) => controller.error(err));
            const { earlyData } = base64ToArrayBuffer(earlyDataHeader);
            if (earlyData) controller.enqueue(earlyData);
        }
    });
}

function base64ToArrayBuffer(base64Str) {
    if (!base64Str) return { earlyData: null };
    try {
        const decode = atob(base64Str.replace(/-/g, "+").replace(/_/g, "/"));
        return { earlyData: Uint8Array.from(decode, c => c.charCodeAt(0)).buffer };
    } catch (e) { return { earlyData: null }; }
}

function arrayBufferToHex(buffer) {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function safeClose(socket) {
    try { if (socket.readyState < 2) socket.close(); } catch (e) {}
}
