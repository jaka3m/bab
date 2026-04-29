# Cloudflare Workers VPN Config Manager

Skrip ini telah diperbaiki untuk meningkatkan stabilitas dan memperbaiki error 1101.

## Cara Deploy yang Benar

Agar skrip ini berjalan dengan sukses di Cloudflare Workers, pastikan hal-hal berikut:

1.  **Format ES Modules**: Gunakan format "Modules" saat membuat Worker (bukan Service Worker). Kode ini menggunakan `export default { fetch ... }`.
2.  **Compatibility Date**: Atur Compatibility Date minimal ke `2023-05-14` atau yang terbaru di Dashboard Cloudflare (Settings -> Compatibility Date).
3.  **Compatibility Flags**: Tambahkan flag `connect_sockets` jika Anda menggunakan Wrangler, atau pastikan akun Anda sudah mendukung fitur `cloudflare:sockets` (biasanya otomatis aktif pada versi terbaru).
4.  **Daftar Proxy**: Pastikan URL daftar proxy di GitHub tetap aktif. Saat ini menggunakan: `https://raw.githubusercontent.com/jaka1m/botak/refs/heads/main/cek/proxyList.txt`

## Perbaikan Utama
- Menangani error global agar tidak muncul Error 1101 yang misterius.
- Menghilangkan `globalThis` yang menyebabkan konflik antar koneksi.
- Memperbaiki fitur "Copy to Clipboard" di tampilan web.
- Parsing daftar proxy yang lebih tangguh.
