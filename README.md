# 🌸 LilyBot — Telegram Multi-Account Automation Dashboard

<div align="center">

**LilyBot** adalah dashboard modern, anggun, dan canggih untuk mengelola otomasi bot Telegram multi-akun (userbot) secara terpusat dengan antarmuka **soft girly pink frosted glass (glassmorphism)**.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-pink.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-black.svg)](https://expressjs.com/)
[![GramJS](https://img.shields.io/badge/GramJS-2.26-blue.svg)](https://gram.js.org/)

</div>

---

## ✨ Fitur Unggulan

1. **Multi-Akun Telegram Realtime**
   - Hubungkan akun Telegram via Nomor HP + OTP + Password 2FA langsung dari dashboard.
   - Sesi tersimpan aman (StringSession persistence) dengan patch stabilitas DC-5 Telegram.
2. **Auto-Reply Cerdas & Fleksibel**
   - Pemicu kata kunci (keyword) ke balasan acak (teks dan media).
   - Dukungan balasan di general chat maupun thread/topik grup spesifik.
3. **Auto Broadcaster Otomatis**
   - Penjadwalan pesan promosi/siaran berkala ke grup target pilihan dengan variasi teks & media.
4. **Pipeline Filter Berlapis Anti-Spam**
   - Emoji prefix gatekeeper → Allowed senders (username/signature/channel) → Blocked filter words → Target group validation.
5. **AI Intent Gatekeeper (Google Gemini)**
   - Filter semantik menggunakan AI untuk mendeteksi intent pesan (SKIP vs PROMOSI) secara presisi.
6. **Certainty Funnel Analytics**
   - Statistik konversi 3-tahap: *Pesan Didengar (Heard)* → *Kata Kunci Cocok (Keyword)* → *Balasan Terkirim (Sent)*.
7. **Message Queue & Proteksi Rate Limit**
   - Adaptive delay (anti-spam), penanganan otomatis `FLOOD_WAIT`, cooldown mute, dan deduplikasi pesan.
8. **Realtime Socket.IO Stream & Arsip Log**
   - Log realtime aktivitas bot, peringatan error, unduh log harian (`.txt`), dan manajemen arsip log.
9. **Full Backup & Restore**
   - Ekspor dan impor seluruh konfigurasi bot (akun, aturan balasan, filter, prompt AI, dan pengaturan) dalam 1 file JSON.
10. **Desain Elegan Soft Pink Glassmorphism**
    - Antarmuka bertema soft girly pink dengan efek frosted glass, tipografi modern, dan palet warna pastel yang harmonis tanpa bloatware.

---

## 🔒 Keamanan (Security Hardened)

- **Autentikasi Server-Side**: Proteksi endpoint API dengan verifikasi password berbasis `bcrypt` dan sesi cookie `httpOnly` yang ditandatangani HMAC-SHA256.
- **Proteksi Brute-Force**: Pembatasan percobaan login (Rate Limiter: max 10 percobaan per 15 menit).
- **Proteksi Data Sesi**: File sesi akun Telegram diisolasi di folder `data/` dan tidak pernah terekspos ke frontend ataupun commit git.

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Prasyarat
- **Node.js** v20.x atau v24.x
- **npm** v10.x atau v11.x

### 2. Kloning & Install Dependensi
```bash
git clone <url-repo-anda> lilybot
cd lilybot
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```

Buat hash password untuk akun admin dashboard:
```bash
npm run gen:hash -- "passwordPilihanAnda"
```
Salin output `DASHBOARD_PASS_HASH` ke dalam file `.env`:
```env
# Gemini API Key untuk AI Intent Gatekeeper
GEMINI_API_KEY=AIzaSy...

# Akun Login Dashboard
DASHBOARD_USER=admin
DASHBOARD_PASS_HASH=$2b$10$...

# Port (Opsional, default 3000)
PORT=3000
```

### 4. Menjalankan Aplikasi

**Mode Pengembangan (Dev):**
```bash
npm run dev
```
Buka browser di `http://localhost:3000`.

**Mode Produksi (Build & Run):**
```bash
npm run build
npm start
```

---

## ☁️ Deploy ke Railway

1. Hubungkan repository GitHub ke proyek baru di **Railway**.
2. Railway akan mendeteksi `Dockerfile` secara otomatis.
3. **PENTING — Pasang Volume Persistent**:
   - Buka service di Railway → tab **Volumes** → **Add Volume**.
   - Mount path: `/app/data` (agar sesi Telegram dan database konfigurasi tidak hilang saat redeploy/restart).
4. Tambahkan Environment Variables di Railway:
   - `GEMINI_API_KEY`: API key Google AI Studio
   - `DASHBOARD_USER`: username dashboard
   - `DASHBOARD_PASS_HASH`: hash bcrypt dari password Anda
   - `DATA_DIR`: `/app/data`
   - `NODE_ENV`: `production`

---

## 🎨 Kustomisasi Brand & Tema

- **Ganti Nama Produk**: Cukup ubah file [branding.ts](file:///c:/Coding/ReBot/src/config/branding.ts). Semua teks, header, unduhan backup, dan metadata otomatis menyesuaikan.
- **Ganti Logo/Favicon**: Ganti file SVG di folder `public/branding/logo.svg` dan `public/branding/favicon.svg`.
- **Tema & Warna**: Tema utama **Lily Blossom** diatur dalam [index.css](file:///c:/Coding/ReBot/src/index.css) menggunakan CSS variables `--accent`, `--bg-card`, dan `--glow`.

---

## 📋 Variabel Lingkungan (Environment Variables)

| Variabel | Wajib | Default | Deskripsi |
|---|---|---|---|
| `DASHBOARD_USER` | Ya | `admin` | Username login dashboard |
| `DASHBOARD_PASS_HASH` | Ya | — | Hash bcrypt kata sandi admin (dibuat via `npm run gen:hash`) |
| `GEMINI_API_KEY` | Ya | — | API key Google Gemini untuk gatekeeper AI |
| `PORT` | Tidak | `3000` | Port server web |
| `DATA_DIR` | Tidak | `./data` | Direktori database lokal / volume Railway |
| `ALLOWED_ORIGIN` | Tidak | — | Whitelist origin untuk CORS (opsional) |

---

## ⚖️ Disclaimer & Lisensi

> **Disclaimer**: Aplikasi ini disediakan untuk keperluan otomasi manajemen percakapan dan pemasaran berbasis persetujuan. Pengguna bertanggung jawab penuh atas nomor Telegram yang digunakan serta kepatuhan terhadap Ketentuan Layanan (*Terms of Service*) Telegram. Penjual/pengembang tidak bertanggung jawab atas pembatasan akun (*flood wait* / pembatasan) akibat aktivitas spam berlebih.
