import { connect } from "cloudflare:sockets";

const vmessUUID = atob('ZjI4MmI4NzgtODcxMS00NWExLThjNjktNTU2NDE3MjEyM2Mx');

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

const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_KEY = str2arr(atob('Vk1lc3MgSGVhZGVyIEFFQUQgS2V5X0xlbmd0aA=='));
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_LENGTH_AEAD_IV = str2arr(atob('Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2VfTGVuZ3Ro'));
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_KEY = str2arr(atob('Vk1lc3MgSGVhZGVyIEFFQUQgS2V5'));
const KDFSALT_CONST_VMESS_HEADER_PAYLOAD_AEAD_IV = str2arr(atob('Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2U='));
const KDFSALT_CONST_AEAD_RESP_HEADER_LEN_KEY = str2arr(atob('QUVBRCBSZXNwIEhlYWRlciBMZW4gS2V5'));
const KDFSALT_CONST_AEAD_RESP_HEADER_LEN_IV = str2arr(atob('QUVBRCBSZXNwIEhlYWRlciBMZW4gSVY='));
const KDFSALT_CONST_AEAD_RESP_HEADER_KEY = str2arr(atob('QUVBRCBSZXNwIEhlYWRlciBLZXk='));
const KDFSALT_CONST_AEAD_RESP_HEADER_IV = str2arr(atob('QUVBRCBSZXNwIEhlYWRlciBJVg=='));

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const DNS_PORT = 53;

const PROTOCOLS = {
    P1: atob('VHJvamFu'),
    P2: atob('VkxFU1M='),
    P3: atob('U2hhZG93c29ja3M='),
    P4: atob('Vk1lc3M='),
    OBFS_PATH: atob('L0ZyZWUtVlBOLUNGLUdlby1Qcm9qZWN0Lw=='),
    VMS_PRE: atob('dm1lc3M6Ly8='),
    VLS_PRE: atob('dmxlc3M6Ly8='),
    TRJ_PRE: atob('dHJvamFuOi8v'),
    VMS_LBL: atob('W1ZNZXNzLVRMU10='),
    VLS_LBL: atob('W1ZMRVNTLVRMU10='),
    TRJ_LBL: atob('W1Ryb2phbi1UTFNd'),
    PL_URL: atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2pha2ExbS9ib3Rhay9yZWZzL2hlYWRzL21haW4vY2VrL3Byb3h5TGlzdC50eHQ=')
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
    fn = createRecursiveHash(str2arr(atob('Vk1lc3MgQUVBRCBLREY=')), fn);
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
        try {
            const url = new URL(request.url);
            const upgradeHeader = request.headers.get("Upgrade");
            
            // 1. Prioritaskan tampilan UI jika path adalah root "/"
            if (url.pathname === "/" && upgradeHeader !== "websocket") {
                return new Response(getHtml(url.hostname), {
                    headers: { "Content-Type": "text/html;charset=UTF-8" },
                });
            }

            // 2. Logika WebSocket
            if (upgradeHeader === "websocket") {
                const pathPattern = new RegExp('^' + PROTOCOLS.OBFS_PATH + '(.+[:=-]\\d+)$', 'i');
                const match = url.pathname.match(pathPattern);
                
                if (match) {
                    globalThis.pxip = match[1].replace(/[=-]/, ':');
                    return await websocketHandler(request);
                }
                
                const oldMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);
                if (oldMatch) {
                    globalThis.pxip = oldMatch[1].replace(/[=-]/, ':');
                    return await websocketHandler(request);
                }
            }
            
            // 3. Jika bukan root dan bukan websocket yang valid
            return new Response("Not Found", { status: 404 });
        } catch (err) {
            return new Response(`Error: ${err.toString()}`, { status: 500 });
        }
    },
};

function getHtml(hostname) {
    return `
<!DOCTYPE html>
<html lang="en" id="htmlRoot">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>${atob('VlBOIENvbmZpZyBNYW5hZ2Vy')}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* Custom styles untuk efek blur dan transisi */
        * {
            transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
        }
        
        .cloud-blur {
            position: fixed;
            border-radius: 50%;
            filter: blur(80px);
            pointer-events: none;
            z-index: 0;
            animation: floatCloud 20s ease-in-out infinite;
        }
        
        @keyframes floatCloud {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -30px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        
        body {
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            color: #f1f5f9;
        }
        
        body.light {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            color: #0f172a;
        }
        
        body.light .glass-deep {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .glass-deep {
            background: rgba(15, 23, 42, 0.5);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* Dropdown Styling */
        .dropdown-menu {
            display: none;
            position: absolute;
            right: 0;
            top: 100%;
            margin-top: 0.5rem;
            width: 220px;
            z-index: 50;
            background: rgba(30, 41, 59, 0.95);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 8px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        }

        body.light .dropdown-menu {
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .dropdown-menu.show {
            display: block;
            animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .action-btn { transition: all 0.2s ease; }
        .action-btn:active { transform: scale(0.95); }
        
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: bold;
        }
        
        .status-active {
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        
        .status-inactive {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .status-checking {
            background: rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.3);
        }
        
        .tooltip {
            position: relative;
            cursor: help;
        }
        
        .tooltip:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 10px;
            white-space: nowrap;
            z-index: 100;
            margin-bottom: 5px;
        }
    </style>
</head>
<body class="min-h-screen py-4 md:py-8 px-3 md:px-6 relative transition-colors duration-300">
    
    <div class="cloud-blur w-[500px] h-[500px] top-[-150px] left-[-150px]" style="background: radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(139,92,246,0.2) 100%);"></div>
    <div class="cloud-blur w-[600px] h-[600px] bottom-[-200px] right-[-200px]" style="background: radial-gradient(circle, rgba(6,182,212,0.3) 0%, rgba(59,130,246,0.15) 100%);"></div>

    <div class="max-w-7xl mx-auto relative z-10">
        
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div class="text-center md:text-left">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-deep text-xs font-semibold mb-3" style="color: #60a5fa;">
                    <i class="fas fa-shield-alt text-[10px]"></i> 
                    <span>NETWORK SECURE</span>
                    <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse ml-1"></span>
                </div>
                <h1 class="text-3xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    ${atob('VlBOIENvbmZpZyBNYW5hZ2Vy')}
                </h1>
            </div>
            <button id="themeToggle" class="fixed top-4 right-4 z-50 w-10 h-10 rounded-full glass-deep flex items-center justify-center text-lg hover:scale-110 transition-all">
                <i class="fas fa-moon"></i>
            </button>
        </div>

        <div class="glass-deep rounded-2xl overflow-hidden shadow-2xl">
            <div class="p-4 md:p-6 border-b" style="border-color: rgba(255,255,255,0.1);">
                <div class="relative group">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <i class="fas fa-search text-slate-500 group-focus-within:text-blue-400 transition-colors"></i>
                    </div>
                    <input type="text" id="searchInput" 
                        placeholder="Search country or ISP..."
                        class="w-full bg-white/10 backdrop-blur-sm border rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 transition-all">
                </div>
            </div>

            <div class="overflow-x-auto p-2 md:p-4">
                <table class="w-full border-collapse">
                    <thead>
                        <tr class="border-b" style="border-color: rgba(255,255,255,0.05);">
                            <th class="py-4 px-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Location</th>
                            <th class="py-4 px-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Provider</th>
                            <th class="py-4 px-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                            <th class="py-4 px-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Action</th>
                        </tr>
                    </thead>
                    <tbody id="proxyTableBody"></tbody>
                </table>
            </div>

            <div id="loading" class="py-24 text-center flex flex-col items-center gap-4">
                <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
                <p class="text-slate-400 text-sm">${atob('RmV0Y2hpbmcgcHJveHkgbGlzdC4uLg==')}</p>
            </div>

            <div class="p-4 md:p-6 border-t flex flex-col md:flex-row justify-between items-center gap-4" style="border-color: rgba(255,255,255,0.1);">
                <div id="paginationInfo" class="text-slate-400 text-xs font-mono"></div>
                <div class="flex gap-3 items-center" id="paginationControls"></div>
            </div>
        </div>
    </div>

    <script>
        const themeToggleBtn = document.getElementById('themeToggle');
        const bodyElement = document.body;
        
        themeToggleBtn.addEventListener('click', () => {
            bodyElement.classList.toggle('light');
            const isLight = bodyElement.classList.contains('light');
            themeToggleBtn.innerHTML = isLight ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        });

        if (localStorage.getItem('theme') === 'light') {
            bodyElement.classList.add('light');
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        }

        const uuid = atob('${btoa(vmessUUID)}');
        const host = "${hostname}";
        const proxyListUrl = atob('${btoa(PROTOCOLS.PL_URL)}');
        const OBFS_PATH = atob('${btoa(PROTOCOLS.OBFS_PATH)}');
        const VMS_PRE = atob('${btoa(PROTOCOLS.VMS_PRE)}');
        const VLS_PRE = atob('${btoa(PROTOCOLS.VLS_PRE)}');
        const TRJ_PRE = atob('${btoa(PROTOCOLS.TRJ_PRE)}');
        const VMS_LBL = atob('${btoa(PROTOCOLS.VMS_LBL)}');
        const VLS_LBL = atob('${btoa(PROTOCOLS.VLS_LBL)}');
        const TRJ_LBL = atob('${btoa(PROTOCOLS.TRJ_LBL)}');
        const SS_LBL = atob('${btoa(PROTOCOLS.SS_LBL)}');
        
        // API URL untuk cek status proxy (diencode dengan atob)
        const CHECK_API_URL = atob('aHR0cHM6Ly9jaGVjay5qYWsuYml6LmlkL2NoZWNr');

        // Auto-detect semua negara menggunakan Intl.DisplayNames (built-in JavaScript)
        const countryNameFormatter = new Intl.DisplayNames(['en'], { type: 'region' });
        
        function getCountryFullName(countryCode) {
            if (!countryCode) return 'Unknown';
            try {
                const upperCode = countryCode.toUpperCase();
                const fullName = countryNameFormatter.of(upperCode);
                return fullName || countryCode;
            } catch (error) {
                return countryCode;
            }
        }

        let allProxies = [];
        let filteredProxies = [];
        let currentPage = 1;
        const itemsPerPage = 10;
        
        // Cache untuk menyimpan hasil pengecekan status proxy
        let statusCache = new Map();

        async function checkProxyStatus(ip, port) {
            const cacheKey = \`\${ip}:\${port}\`;
            
            // Cek cache dulu
            if (statusCache.has(cacheKey)) {
                return statusCache.get(cacheKey);
            }
            
            try {
                const apiUrl = \`\${CHECK_API_URL}?ip=\${ip}:\${port}\`;
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                const result = {
                    status: data.status || 'UNKNOWN',
                    delay: data.delay || 'N/A',
                    speed: data.speed_est || 'N/A',
                    isp: data.isp || '',
                    country: data.country || '',
                    asn: data.asn || '',
                    colo: data.colo || ''
                };
                
                // Simpan ke cache
                statusCache.set(cacheKey, result);
                return result;
            } catch (error) {
                console.error('Error checking proxy:', error);
                const errorResult = { status: 'ERROR', delay: 'N/A', speed: 'N/A' };
                statusCache.set(cacheKey, errorResult);
                return errorResult;
            }
        }

        async function fetchProxies() {
            try {
                const response = await fetch(proxyListUrl);
                const text = await response.text();
                const lines = text.trim().split('\\n');
                allProxies = lines.map(line => {
                    const [ip, port, country, isp] = line.split(',');
                    return { 
                        ip, 
                        port, 
                        country: getCountryFullName(country), 
                        isp, 
                        countryCode: country,
                        status: null,
                        delay: null,
                        speed: null
                    };
                }).filter(p => p.ip && p.port);
                filteredProxies = [...allProxies];
                renderTable();
                document.getElementById('loading').classList.add('hidden');
                
                // Mulai pengecekan status untuk semua proxy
                checkAllProxyStatuses();
            } catch (error) {
                console.error('Error:', error);
            }
        }
        
        async function checkAllProxyStatuses() {
            // Pengecekan status untuk semua proxy secara paralel dengan batasan
            const batchSize = 5; // Cek 5 proxy sekaligus untuk menghindari rate limit
            for (let i = 0; i < filteredProxies.length; i += batchSize) {
                const batch = filteredProxies.slice(i, i + batchSize);
                await Promise.all(batch.map(async (proxy, idx) => {
                    const globalIdx = i + idx;
                    const statusData = await checkProxyStatus(proxy.ip, proxy.port);
                    proxy.status = statusData.status;
                    proxy.delay = statusData.delay;
                    proxy.speed = statusData.speed;
                    proxy.checkInfo = statusData;
                    
                    // Update tabel jika proxy ini masih di halaman yang sedang aktif
                    updateProxyRowInTable(globalIdx, proxy);
                }));
            }
        }
        
        function updateProxyRowInTable(proxyIndex, proxy) {
            // Cek apakah proxy ini sedang ditampilkan di halaman saat ini
            const start = (currentPage - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            
            if (proxyIndex >= start && proxyIndex < end) {
                // Update row yang sesuai
                const rowIndex = proxyIndex - start;
                const tbody = document.getElementById('proxyTableBody');
                const rows = tbody.getElementsByTagName('tr');
                
                if (rows[rowIndex]) {
                    const statusCell = rows[rowIndex].querySelector('.status-cell');
                    if (statusCell) {
                        statusCell.innerHTML = getStatusHtml(proxy);
                    }
                }
            }
        }

        function generateVmess(proxy) {
            const path = OBFS_PATH + proxy.ip + "=" + proxy.port;
            const vmessObj = { v: "2", ps: VMS_LBL + " " + proxy.country + " - " + proxy.isp, add: host, port: 443, id: uuid, aid: "0", scy: "zero", net: "ws", type: "none", host: host, path: path, tls: "tls", sni: host };
            return VMS_PRE + btoa(JSON.stringify(vmessObj));
        }

        function generateVless(proxy) {
            const path = encodeURIComponent(OBFS_PATH + proxy.ip + "=" + proxy.port);
            return VLS_PRE + uuid + "@" + host + ":443?encryption=none&security=tls&type=ws&host=" + host + "&path=" + path + "&sni=" + host + "#" + encodeURIComponent(VLS_LBL + " " + proxy.country);
        }

        function generateTrojan(proxy) {
            const path = encodeURIComponent(OBFS_PATH + proxy.ip + "=" + proxy.port);
            return TRJ_PRE + uuid + "@" + host + ":443?security=tls&type=ws&host=" + host + "&path=" + path + "&sni=" + host + "#" + encodeURIComponent(TRJ_LBL + " " + proxy.country);
        }

        function generateShadowsocks(proxy) {
            // Format sesuai contoh: ss://method:password@host:port?parameter#tag
            const method = "none";
            const password = uuid;
            const encodedAuth = btoa(\`\${method}:\${password}\`);
            const path = encodeURIComponent(OBFS_PATH + proxy.ip + "=" + proxy.port);
            
            // URL Shadowsocks dengan parameter yang sama seperti VMESS/VLESS/TROJAN
            const ssUrl = \`ss://\${encodedAuth}@\${host}:443?path=\${path}&security=tls&host=\${host}&type=ws&sni=\${host}#\${encodeURIComponent(SS_LBL + " " + proxy.country)}\`;
            
            return ssUrl;
        }

        function toggleDropdown(id) {
            document.querySelectorAll('.dropdown-menu').forEach(el => {
                if(el.id !== 'drop-' + id) el.classList.remove('show');
            });
            document.getElementById('drop-' + id).classList.toggle('show');
        }

        window.onclick = function(event) {
            if (!event.target.closest('.dropdown-container')) {
                document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show'));
            }
        }

        function copyToClipboard(text, btn) {
            navigator.clipboard.writeText(text).then(() => {
                const original = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Copied';
                setTimeout(() => { btn.innerHTML = original; }, 1500);
            });
        }
        
        function getStatusHtml(proxy) {
            if (!proxy.status) {
                return \`
                    <div class="status-badge status-checking">
                        <i class="fas fa-spinner fa-pulse"></i>
                        <span>Checking...</span>
                    </div>
                \`;
            }
            
            const isActive = proxy.status === 'ACTIVE';
            const tooltipText = \`Delay: \${proxy.delay} | Speed: \${proxy.speed}\`;
            
            if (isActive) {
                return \`
                    <div class="status-badge status-active tooltip" data-tooltip="\${tooltipText}">
                        <i class="fas fa-check-circle animate-pulse text-green-500"></i>
                        <span class="animate-pulse text-green-500 font-semibold">ACTIVE</span>
                    </div>
                \`;
            } else if (proxy.status === 'ERROR') {
                return \`
                    <div class="status-badge status-inactive tooltip" data-tooltip="Connection failed">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>ERROR</span>
                    </div>
                \`;
            } else {
                return \`
                    <div class="status-badge status-inactive">
                        <i class="fas fa-times-circle"></i>
                        <span>INACTIVE</span>
                    </div>
                \`;
            }
        }

        function renderTable() {
            const start = (currentPage - 1) * itemsPerPage;
            const paged = filteredProxies.slice(start, start + itemsPerPage);
            const tbody = document.getElementById('proxyTableBody');
            tbody.innerHTML = '';

            paged.forEach((proxy, idx) => {
                const id = start + idx;
                const vmess = generateVmess(proxy);
                const vless = generateVless(proxy);
                const trojan = generateTrojan(proxy);
                const shadowsocks = generateShadowsocks(proxy);

                tbody.innerHTML += \`
                    <tr class="border-b border-white/5 hover:bg-white/5 transition-all">
                        <td class="py-4 px-4">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">\${getFlagEmoji(proxy.countryCode)}</span>
                                <div>
                                    <div class="font-bold text-sm md:text-base">\${proxy.country}</div>
                                    <div class="text-[11px] text-slate-400 font-mono">\${proxy.ip}:\${proxy.port}</div>
                                </div>
                            </div>
                        </td>
                        <td class="py-4 px-4">
                            <div class="text-sm">\${proxy.isp || '-'}</div>
                        </td>
                        <td class="py-4 px-4 text-center status-cell">
                            \${getStatusHtml(proxy)}
                        </td>
                        <td class="py-4 px-4 text-right relative dropdown-container">
                            <button onclick="toggleDropdown('\${id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2">
                                <i class="fas fa-cog"></i> Config <i class="fas fa-chevron-down text-[10px]"></i>
                            </button>
                            
                            <div id="drop-\${id}" class="dropdown-menu">
                                <div class="grid grid-cols-2 gap-2">
                                    <button onclick="copyToClipboard('\${vless}', this)" class="bg-indigo-600 hover:bg-indigo-700 p-2 rounded-md text-[10px] font-bold text-white flex flex-col items-center gap-1">
                                        <i class="fas fa-link"></i> VLESS
                                    </button>
                                    <button onclick="copyToClipboard('\${trojan}', this)" class="bg-purple-600 hover:bg-purple-700 p-2 rounded-md text-[10px] font-bold text-white flex flex-col items-center gap-1">
                                        <i class="fas fa-shield-halved"></i> TROJAN
                                    </button>
                                    <button onclick="copyToClipboard('\${shadowsocks}', this)" class="bg-cyan-600 hover:bg-cyan-700 p-2 rounded-md text-[10px] font-bold text-white flex flex-col items-center gap-1">
                                        <i class="fas fa-lock"></i> SS GatchaNG
                                    </button>
                                    <button onclick="copyToClipboard('\${vmess}', this)" class="bg-emerald-600 hover:bg-emerald-700 p-2 rounded-md text-[10px] font-bold text-white flex flex-col items-center gap-1">
                                        <i class="fas fa-bolt"></i> VMESS
                                    </button>
                                </div>
                            </div>
                         </td>
                     </tr>
                \`;
            });
            updatePagination();
        }

        function updatePagination() {
            const totalPages = Math.ceil(filteredProxies.length / itemsPerPage);
            document.getElementById('paginationInfo').innerText = \`Page \${currentPage} of \${totalPages}\`;
            const controls = document.getElementById('paginationControls');
            controls.innerHTML = '';
            
            const btnClass = "px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-30";
            
            const prev = document.createElement('button');
            prev.className = btnClass;
            prev.innerHTML = '<i class="fas fa-chevron-left"></i> Prev';
            prev.disabled = currentPage === 1;
            prev.onclick = () => { currentPage--; renderTable(); };
            
            const next = document.createElement('button');
            next.className = btnClass;
            next.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
            next.disabled = currentPage === totalPages;
            next.onclick = () => { currentPage++; renderTable(); };
            
            controls.append(prev, next);
        }

        function getFlagEmoji(countryCode) {
            if (!countryCode || countryCode.length !== 2) return '🌐';
            const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt());
            return String.fromCodePoint(...codePoints);
        }

        document.getElementById('searchInput').oninput = (e) => {
            const query = e.target.value.toLowerCase();
            filteredProxies = allProxies.filter(p => p.country.toLowerCase().includes(query) || p.isp.toLowerCase().includes(query));
            currentPage = 1;
            renderTable();
        };

        fetchProxies();
    </script>
</body>
</html>`;
}

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
        const key = md5(uuidBytes, str2arr(atob('YzQ4NjE5ZmUtOGYwMi00OWUwLWI5ZTktZWRmNzYzZTE3ZTIx')));
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

    const key = md5(uuidBytes, str2arr(atob('YzQ4NjE5ZmUtOGYwMi00OWUwLWI5ZTktZWRmNzYzZTE3ZTIx')));
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
