# Refactor & Productization Plan — ReBot (Telegram Bot Dashboard)

> **Dokumen ini adalah instruksi kerja untuk AI Agent (atau developer) yang menjalankan refactor.**
> Baca seluruh dokumen ini sebelum menyentuh kode. Ikuti urutan fase. Jangan lompat fase.

---

## 0. Konteks Proyek

**ReBot** (nama lama/eksisting: `TeleOffer` / `LunoxyTelebot`) adalah dashboard admin untuk mengelola
bot auto-reply Telegram multi-akun (userbot via GramJS `telegram` library).

**Fungsi inti yang WAJIB dipertahankan 100% (tidak boleh ada yang hilang):**

1. Multi-akun Telegram — connect via nomor HP + OTP + 2FA password, simpan session string
2. Auto-reply: keyword → balasan acak (teks + media), bisa reply di thread/topic
3. Auto Broadcaster: keyword → kirim item acak (teks + media) ke grup target
4. Pipeline filter berlapis: emoji prefix → allowed senders → blocked/filter words → AI intent gatekeeper → source/sender filter → target group validation
5. Message queue per akun dengan: rate limit per-grup, adaptive delay, FLOOD_WAIT cooldown, mute cooldown, dedupe
6. **Certainty Funnel** — statistik heard → keyword → sent (untuk optimasi)
7. AI Intent Gatekeeper (Gemini) — SKIP / PROMOSI
8. Socket.IO realtime: bot-log, error-log, flood-wait, account-disconnect
9. Halaman: Dashboard, Logs (filter/search/export/harian), AI (config + stats), Inspect (diagnostics Railway), Settings (theme/notification/import-export), Account Profile (15 section + 4 modal)
10. Backup/Restore: export & import full config JSON, export log harian TXT
11. Polling fallback + auto-reconnect saat server start

**Stack:** React 19 + Vite 6 + TailwindCSS 4 + Express 4 + Socket.IO 4 + GramJS `telegram` 2.26 + TypeScript 5.8 (mode: `tsx`)
**Runtime:** Node 24 · Target deploy: Railway (Docker)

---

## 1. Aturan Mutlak (WAJIB DIPATUHI)

> ### 🚫 ATURAN #1 — JANGAN PERNAH MENGHAPUS FITUR
> Refactor = restrukturisasi, **bukan** pengurangan functionality.
> Jika ada kode yang terlihat "tidak terpakai", **jangan hapus** — tandai dengan `// DEAD_CODE_CANDIDATE: <alasan>` dan lanjutkan. Penghapusan hanya boleh di Fase 2 (junk file) dengan konfirmasi manusia.

> ### 🚫 ATURAN #2 — VERIFIKASI SETIAP FASE
> Setiap fase punya **Verification Commands**. Wajib dijalankan dan output-nya harus direkam. Kalau gagal, perbaiki — jangan lanjut ke fase berikutnya.

> ### 🚫 ATURAN #3 — COMMIT SETIAP FASE
> Satu fase = satu atau lebih commit. Format: `[Fase-N] deskripsi singkat`.
> Tag baseline di Fase 0.

> ### 🚫 ATURAN #4 — TIDAK ADA BACKUP FILE LOKAL
> Dilarang membuat `file.ts.bak`, `file-old.ts`, `copy-of-*.ts`. Git adalah sistem versioning. File sisa-sisa seperti ini justru harus dihapus.

> ### 🚫 ATURAN #5 — JANGAN UBAH TAMPILAN DI FASE 0-2 DAN 4-6
> Tampilan hanya berubah di **Fase 3 (branding/theme)**. Refactor kode (Fase 4) harus menjaga output visual identik.

> ### 🚫 ATURAN #6 — JANGAN KIRIM SECRET KE MANA PUN
> API key Telegram, session string, `GEMINI_API_KEY` = data nyata milik pemilik asli. Hanya boleh berpindah file lokal, tidak boleh masuk commit, log, atau output chat.

---

## 2. Prasyarat

```bash
# Verifikasi environment
node -v          # harus v24.x
npm -v           # harus 11.x
npm install      # bila node_modules belum ada

# Gate utama — harus PASS di setiap akhir fase
npx tsc --noEmit   # exit code 0, tanpa output error
```

**Cara menjalankan aplikasi (dev):** `npm run dev` → buka `http://localhost:3000`
**Build produksi:** `npm run build` → output ke `dist/`
**Start produksi:** `NODE_ENV=production npm start`

> ⚠️ **Tidak ada automated test sama sekali di repo ini.** Ini sebabnya Aturan #1 dan #2 sangat penting. Di Fase 6 kamu akan menambah test — sampai saat itu, kompilasi + verifikasi manual adalah satu-satunya jaring pengaman.

---

## 3. Baseline Kondisi Saat Ini (hasil audit — sudah diverifikasi)

### 3.1 Risiko Kritis (bukan sekadar masalah syntactic)

| Temuan | Lokasi | Dampak |
|---|---|---|
| **Kredensial dashboard hardcoded** `celiimut` / `celiimutbangettz` | `src/components/LoginPage.tsx:19` | Password ikut ter-bundle di JS. Pembeli bisa membacanya di DevTools. |
| **Auth 100% client-side** — flag `tele-auth` di localStorage/sessionStorage, server tidak pernah memvalidasi | `src/App.tsx:72-76`, `LoginPage.tsx:19-26` | Seluruh `/api/*` terbuka untuk siapa pun: bisa menambah akun, mengirim pesan, dan membaca semua data. |
| **`data/` tidak di-gitignore** | `.gitignore` | `data/accounts.json` berisi **8 session string Telegram asli** (akun: `ivy`, `Lunoxy`, `001`–`005`, `A1`). Commit = seluruh akun hilang. |
| **`media/` tidak di-gitignore** | `.gitignore` | Berisi foto & media milik pemilik asli. |
| **Tidak ada `.env.example`** | — | Pembeli tidak tahu env var apa yang wajib diisi. |
| **Seluruh source belum pernah di-commit** | `git log` = 1 commit (`README.md` saja), 15 path untracked | Refactor tanpa baseline = risiko kehilangan semua kerja. |
| Tidak ada rate limit / helmet / CORS whitelist | `server.ts:183-187` | Permukaan serangan terbuka. |

### 3.2 Struktur & Ukuran

```
ReBot/
├── server.ts                 1638 LOC  ← monolith (target utama Fase 4)
├── src/                      33 file, ~407 KB
│   ├── App.tsx                724
│   ├── index.css              790
│   ├── components/
│   │   ├── AccountProfile.tsx          1062  ← monolith
│   │   ├── CertaintyFunnelWidget.tsx    432
│   │   ├── AIStatsChart.tsx             384
│   │   ├── LoginPage.tsx                377
│   │   ├── SendStatsChart.tsx           109
│   │   ├── DashboardWidgets.tsx         173
│   │   ├── PinkAestheticBg.tsx          139
│   │   └── account-profile/    ← sudah dipartial-split (sections/ + modals/)
│   └── pages/
│       ├── InspectPage.tsx     1052  ← monolith
│       ├── LogsPage.tsx        1040  ← monolith
│       ├── AIPage.tsx           836  ← monolith
│       ├── DashboardPage.tsx    260
│       └── SettingsPage.tsx      97
├── backend/                   19 file, ~178 KB — SUDAH modular (routes/services/repositories/utils)
│   ├── routes/      accountRoutes 664, inspectRoutes 347, logsRoutes 306, settingsRoutes 335,
│   │                authRoutes 175, broadcastRoutes 119, aiRoutes 43
│   ├── services/    AIService 562, AutoBackupService 468, BroadcastService 271, LogRetentionService 218
│   ├── repositories/ StatsRepository 476, SettingsRepository 247, AiConfigRepository 159, AccountRepository 75
│   ├── utils/       KeywordIndex 252, matching 249, Logger 69
│   └── config/      storage 42
├── data/           ← RUNTIME ONLY (jangan di-commit): accounts.json, settings.json,
│                      account_settings.json, stats.json, ai_config.json, logs/, backups/
├── media/          ← RUNTIME ONLY (jangan di-commit)
├── dist/           ← build output
└── junk: backup-folder/ (30f), backups/ (63KB), scratch/ (16f), fix-history/ (8f),
          logs/, android/ (656f), lunoxy-backup.js, metadata.json,
          teleoffer-full-backup-*.json (3), teleoffer-logs-*.txt (3)
```

### 3.3 Sebaran Brand (Brand Scatter) - 9 titik

| # | File:Line | String |
|---|---|---|
| 1 | `index.html:6` | `<meta name="description" content="TeleOffer - Telegram Bot Dashboard">` |
| 2 | `index.html:13` | `<title>TeleOffer Dashboard</title>` |
| 3 | `src/components/LoginPage.tsx:177` | `<h1>TeleOffer</h1>` |
| 4 | `src/App.tsx:78` | `localStorage.getItem("teleoffer-theme")` |
| 5 | `src/App.tsx:102` | `localStorage.setItem("teleoffer-theme", theme)` |
| 6 | `src/App.tsx:279` | `a.download = \`teleoffer-full-backup-...\`` |
| 7 | `src/components/AccountProfile.tsx:613` | `a.download = \`teleoffer-backup-...\`` |
| 8 | `src/pages/LogsPage.tsx:240,714` | `teleoffer-logs-today-*.txt`, `root@teleoffer:~# tail -f ...` |
| 9 | `src/pages/InspectPage.tsx:690` | `deploy repositori LunoxyTelebot ini` |

Bonus: `Dockerfile:1` (`# Dockerfile for LunoxyTelebot`), `capacitor.config.ts:2-3` (`com.shelly.lunoxytelebot`, `lunoxy-telebot`), `package.json` `name: "react-example"`, localStorage key `tele-auth` (`App.tsx:74-75` untuk cek, `App.tsx:312-313` untuk logout).

### 3.4 Theme System Saat Ini

`src/index.css` — 5 blok tema hardcoded di baris **8-107**: `[data-theme="obsidian"|"phantom"|"blood"|"frost"|"pink"]`, masing-masing ~20 baris. Total **65 CSS custom property** di file tersebut. Tema diterapkan via `document.documentElement.setAttribute("data-theme", theme)` (`App.tsx:101`).

### 3.5 Kekurangan Kualitas

- **tsconfig tidak `strict`** → flag `strict`, `noUnusedLocals`, `noUnusedParameters` belum aktif
- **`any` tersebar**: `server.ts` ~66, `accountRoutes.ts` ~21, `logsRoutes.ts` 12, `LogsPage.tsx` 12, `AIService.ts` 10, `matching.ts` 9, `BroadcastService.ts` 9, `settingsRoutes.ts` 9, `KeywordIndex.ts` 9
- **Tidak ada test** (0 file)
- **Tidak ada ESLint/Prettier** — hanya `npm run lint` = `tsc --noEmit`
- **362 string Indonesia hardcoded** di JSX (belum termasuk log runtime)
- Depredasi: `@google/generative-ai@0.24.1` (duplikat & usang) berdampingan dengan `@google/genai@1.29.0`
- `index.html:15-27` ada monkey-patch `window.fetch` defensif, dan `vite.config.ts` punya `loadEnv` yang di-`void` (dead code)

---

## 4. Rencana Fase

---

## ✅ FASE 0 — Baseline & Jaring Pengaman
**Estimasi:** 15 menit · **Risiko:** rendah · **BLOCKER — jangan mulai fase lain sebelum ini selesai**

### Tujuan
Menciptakan titik balik yang aman. Saat ini 15 path untracked — satu kesalahan `rm` = kehilangan semuanya.

### Langkah

**0.1 — Perbaiki `.gitignore` DULU, baru commit**

Tambahkan ke `.gitignore` (jika belum ada):
```gitignore
# Runtime data — contains real Telegram session strings & owner media
data/
media/
logs/

# Local backups & scratch
backup-folder/
scratch/
fix-history/

# Local exports
teleoffer-*.json
teleoffer-*.txt
*.txt.bak
```

> **PENTING — urutan krusial:** `.gitignore` **HARUS** diedit **SEBELUM** `git add -A`. Kalau terbalik, `data/accounts.json` (isi 8 session string asli) akan masuk commit. Setelah masuk, history harus di-purge — jauh lebih repotoh.

Verifikasi ignore bekerja:
```bash
git check-ignore -v data/accounts.json media/ .env
# semua harus mengembalikan output rule yang cocok
# contoh: data/accounts.json -> .gitignore:<line>:data/
```

**0.2 — Buat `.env.example`** (tanpa nilai nyata)
```bash
# Salin nama variabel dari .env, isi dengan placeholder.
# Isi saat ini: GEMINI_API_KEY
```
Isi minimal:
```bash
# Salin file ini menjadi .env lalu isi dengan nilai asli. JANGAN commit .env.
GEMINI_API_KEY=

# Required after Fase 1
DASHBOARD_USER=
DASHBOARD_PASS_HASH=
```

**0.3 — Commit baseline**
```bash
git add -A
git status              # VERIFIKASI: data/ dan media/ TIDAK ADA di daftar
git commit -m "[Fase-0] Baseline: pre-refactor snapshot"
git tag v0-baseline
```

### Verification
```bash
git log --oneline          # harus ≥ 2 commit
git ls-files | Select-String "data/|media/"   # harus KOSONG (PowerShell)
# atau POSIX:
git ls-files | grep -E "^(data|media)/"    # harus kosong
npx tsc --noEmit          # harus exit 0
```

### Deliverable
Commit baseline bertag + `.gitignore` aman + `.env.example` ada.

---

## ✅ FASE 1 — Hardening Authentication & Security
**Estimasi:** 2-3 jam · **Risiko:** sedang-tinggi · **WAJIB sebelum produk dijual**

### Tujuan
Auth moved dari client ke server. Ini satu-satunya fase yang **mengubah perilaku** —Namun justru itu yang membuat produk layak dijual.

### Latar Belakang
Saat ini `LoginPage.tsx:19` membandingkan username/password secara hardcoded di browser, lalu set `localStorage["tele-auth"]="1"`. Server **tidak pernah** memeriksa flag ini. Konsekuensinya: `/api/accounts`, `/api/settings`, `/api/logs`, `/api/tg/connect`, `/api/ai/*` semuanya publik. Pembeli yang install ini akan langsung di-hack.

### Langkah

**1.1 — Tambah dependency**
```bash
npm install bcryptjs cookie-parser
npm install -D @types/cookie-parser
```
>>Pakai `bcryptjs` (pure JS, tanpa native build) — Railway & Windows aman. Hindari `bcrypt` yang butuh `node-gyp`.

**1.2 — Buat `backend/config/auth.ts`** (BARU)
```ts
// Exports:
//   - hashPassword(plain): Promise<string>
//   - verifyPassword(plain, hash): Promise<boolean>
//   - signSession() / verifySession(token)   → JWT atau signed cookie (tanpa dependency eksternal:
//     gunakan `node:crypto` HMAC, sudah cukup untuk single-instance Railway)
//   - requireAuth middleware  (401 bila belum login)
//   - requireAuthForSockets   (validasi handshake Socket.IO)
```
- Password compare **harus** `bcrypt.compare` (timing-safe). Jangan `===`.
- `DASHBOARD_USER` / `DASHBOARD_PASS_HASH` dibaca dari `process.env`. Kalau kosong → server **harus refuse to start** dengan pesan jelas (fail-fast, jangan diam-diam jatuh ke mode terbuka).
- Buat script helper: `npm run gen:hash -- "<password>"` untuk pembeli membuat hash-nya sendiri.

**1.3 — `LoginPage.tsx` — ubah jadi API call**

Ganti blok `handleSubmit` (sekitar `LoginPage.tsx:14-30`):
```ts
const res = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
```
- Hapus blok `if (username === "celiimut" && ...)` **seluruhnya**
- Hapus penulisan `localStorage.setItem("tele-auth", ...)`. Server yang pegang sesi (httpOnly cookie).
- `rememberMe` → `'remember'` dalam `maxAge` cookie, bukan flag di storage.
- `onLogin()` tetap dipanggil bila response ok — signature komponen tidak diubah.

**1.4 — `App.tsx` — `isAuthed` dari server, bukan dari localStorage**

Ganti `App.tsx:72-76`:
```ts
// SEBELUM (SALAH — flag client-side bisa dipalsukan):
const [isAuthed, setIsAuthed] = useState(() =>
  sessionStorage.getItem("tele-auth") === "1" || localStorage.getItem("tele-auth") === "1");

// SESUDAH (BENAR — server yang berwenang):
const [isAuthed, setIsAuthed] = useState(false);
// di dalam useEffect mount: fetch("/api/auth/session") → setIsAuthed(data.authenticated)
```
- Hapus seluruh pemakaian `"tele-auth"`. `grep -rn "tele-auth" src/` harus **0 hasil** setelah selesai.
- Tambahkan guard: saat `isAuthed === false`, jangan render halaman aplikasi.
- Tangani 401 dari API: `apiFetch()` helper yang me-`logout` otomatis saat 401.

**1.5 — Pasang middleware di `server.ts`**
- `app.use(cookieParser())` dan `app.use(helmet())` → `npm install helmet`
- `app.use("/api", requireAuth)` **sebelum** semua router — dengan pengecualian `app.post("/api/auth/login")` dan `app.get("/api/auth/session")` yang didaftarkan **sebelum** middleware.
- `express.json({ limit: "100mb" })` (`server.ts:183`) → turunkan ke `10mb`.100mb membuka risiko memory-exhaustion.
- `/media` static (`server.ts:187`) → pindahkan **setelah** auth middleware (media owner adalah data sensitif)
- CORS: whitelist origin. Tambahkan env `ALLOWED_ORIGIN` (default: domain sendiri).
- Rate limit pada `/api/auth/login`: `npm install express-rate-limit` → `windowMs: 15*60*1000, max: 10`. Ini wajib karena brute-force dashboard adalah ancaman paling nyata.
- Socket.IO: validasi handshake dengan cookie auth di `io.on("connection")` (`server.ts:367`), reject bila tidak sah.

**1.6 — `npm run gen:hash`**

Tambahkan ke `scripts` di `package.json`.

### Verification
```bash
npx tsc --noEmit                       # exit 0
npm run build                          # harus sukses

# Manual WAJIB — cek satu per satu, catat hasil:
```
| # | Uji | Ekspektasi |
|---|---|---|
| 1 | `curl -i http://localhost:3000/api/accounts` tanpa login | `401` |
| 2 | `curl -i -X POST http://localhost:3000/api/auth/login` dengan kredensial salah | `401` |
| 3 | Login benar via browser | Masuk dashboard, cookie httpOnly terpasang |
| 4 | `curl -i http://localhost:3000/api/accounts` **dengan** cookie | `200` |
| 5 | Buka DevTools → Application → Local Storage | **tidak ada** key `tele-auth` |
| 6 | `grep -rn "celiimut\|tele-auth" src/` | **0 hasil** |
| 7 | `grep -rn "DASHBOARD_PASS_HASH\|DASHBOARD_USER" src/` | **0 hasil** (tidak boleh bocor ke bundle) |
| 8 | Hapus semua env → `npm start` | Server **menolak start** dengan pesan jelas |
| 9 | Login salah 11× berurutan | `429 Too Many Requests` |
| 10 | `npm run gen:hash -- "test123"` | Hash bcrypt valid, != "test123" |

> Uji #1 dan #2 adalah pembuktian bahwa exploit lama sudah tertutup.

### Deliverable
Auth server-side, kredensial hardcoded hilang, rate limit aktif, semua endpoint terlindungi.

---

## ✅ FASE 2 — Pembersihan Junk & Housekeeping
**Estimasi:** 1 jam · **Risiko:** rendah · **Menjinakkan repo untuk dijual**

### Tujuan
Buang seluruh artefak development & data pemilik asli. Repositasinya harus terlihat seperti produk, bukan workspace pribadi.

### Langkah

**2.1 — Hapus junk (perIrusan dari `git`, permanen)**
```
backup-folder/     (30 file — salinan data lama + log 20MB)
backups/           (63 KB)
scratch/           (16 file — skrip debugging sekali pakai)
fix-history/       (8 file md — catatan refactor internal)
logs/
dist/              (build output — di-rebuild otomatis)
android/           (656 file — Capacitor, tidak dipakai di Railway)
lunoxy-backup.js
metadata.json
teleoffer-full-backup-2026-09-11.json
teleoffer-full-backup-2026-09-22.json
teleoffer-full-backup-2026-10-01.json
teleoffer-logs-2026-09-20.txt
teleoffer-logs-2026-09-23.txt
```
> **Peringatan:** `data/` dan `media/` **TIDAK** dihapus — hanya di-ignore di Fase 0. Hapus isinya secara manual oleh manusia bila memang tidak boleh dibagikan; jangan kamu yang menghapus (-isinya data operasional pemilik asli yang mungkin masih dibutuhkan).

**2.2 — Bersihkan `package.json`**
- `"name": "react-example"` → `"name": "rebot"`
- `"version": "0.0.0"` → `"1.0.0"`
- `"private": true` — **pertahankan** (produk dijual, bukan dipublikasikan ke npm)
- `"private": true` + tambahkan `"license": "UNLICENSED"` bila lisensi proprietary, atau `"SEE LICENSE IN LICENSE.md"` bila Anda memilih GPL

**2.3 — Hapus dependency deprecated**
```bash
npm uninstall @google/generative-ai
```
> **VERIFIKASI DULU:** `grep -rn "@google/generative-ai" src/ backend/ server.ts` — pastikan **0 hasil**. Kalau masih dipakai, migrasikan ke `@google/genai` yang API-nya berbeda (`generateContent`), lalu jalankan ulang test AI intent gatekeeper secara manual (Fase 6 sudah menyediakan test-nya). Kalau tidak confident, **jangan uninstall** — cukup tambahkan komentar TODO dan lanjutkan.

**2.4 — Bersihkan dead code yang teridentifikasi**
- `vite.config.ts`: hapus `const env = loadEnv(mode, ".", ""); void env;` beserta import `loadEnv` — tidak dipakai
- `index.html:15-27`: monkey-patch `window.fetch`. **Hapus hanya setelah** memastikan tidak ada dependensi pada proteksi ini. Jika ragu, sisipkan komentar `<!-- LEGACY: Pertahankan bila ada override fetch di masa depan -->`.
- Hapus `console.log` debugging yang tersisa di backend (dicek via `grep -rn "console\.log" backend/`). `console.error` untuk error handling **boleh** dipertahankan.

**2.5 — README.md yang layak jual**

Ganti isi 2-baris yang sekarang dengan (minimal):
```markdown
# ReBot — Telegram Bot Dashboard
Deskripsi 1-2 kalimat. Fitur utama. Screenshot.

## Fitur
- Auto-reply keyword → balasan acak (teks + media)
- Auto Broadcaster
- Pipeline filter berlapis + AI Intent Gatekeeper (Gemini)
- Certainty Funnel analytics
- Multi-akun dengan session persistence

## Instalasi
1. `git clone <repo>` && `npm install`
2. `cp .env.example .env` → isi `GEMINI_API_KEY`, `DASHBOARD_USER`, `DASHBOARD_PASS_HASH`
   (`npm run gen:hash -- "password-anda"` untuk membuat hash)
3. `npm run build && npm start` → buka http://localhost:3000

## Deploy ke Railway
1. Push ke GitHub
2. Railway → New Project → deploy repo ini (Dockerfile terdeteksi otomatis)
3. Tambahkan volume untuk `/app/data` (wajib — session Telegram hilang bila tidak)
4. Set env vars: `GEMINI_API_KEY`, `DASHBOARD_USER`, `DASHBOARD_PASS_HASH`, `DATA_DIR=/app/data`

## Env Vars
| Var | Wajib | Keterangan |
|---|---|---|
| `GEMINI_API_KEY` | ya (untuk AI gatekeeper) | API key Google AI Studio |
| `DASHBOARD_USER` | ya | Username dashboard |
| `DASHBOARD_PASS_HASH` | ya | bcrypt hash dari `npm run gen:hash` |
| `DATA_DIR` | Railway saja | Path volume, default `/data` |
| `PORT` | tidak | Default 3000 |
| `ALLOWED_ORIGIN` | tidak | Untuk CORS whitelist |

## Struktur Project
(ringkas: server.ts + backend/ + src/)

## Lisensi & Disclaimer
Lisensi: ...
Produk ini disediakan "as is" - tanpa garansi. Lakukan pengujian sendiri sebelum dipakai produksi.
> Jangan klaim produk ini sudah diuji atau terverifikasi terhadap kebijakan Telegram - pembeli yang bertanggung jawab atas penggunaan masing-masing.

## Troubleshooting
- Bot tidak merespons → cek tab Logs, filter `error`
- FLOOD_WAIT sering → turunkan `antiSpamDelay`, kurangi jumlah akun
- Session hilang setelah restart → pastikan volume Railway ter-mount
```

> Struktur markdown di atas sengaja dibuat agak raguk agar mudah diparse. Rapikan narasi saat menulis — yang wajib ada: fitur, instalasi, deploy Railway, env vars, struktur, lisensi, disclaimer, troubleshooting.

### Verification
```bash
npx tsc --noEmit
npm run build
npm start          # pastikan app masih boot & login berhasil (test Fase 1)
git status         # hanya file yang memang boleh diubah
```
| # | Uji | Ekspektasi |
|---|---|---|
| 1 | Login ke dashboard | Berhasil, semua 5 halaman terbuka |
| 2 | Buka tab Logs | Log historis tetap terbaca dari `data/logs/` |
| 3 | `git ls-files` | Tidak ada `scratch/`, `backup-folder/`, `android/` |
| 4 | `cat package.json` | `name: "rebot"`, tanpa `@google/generative-ai` |

### Deliverable
Repo bersih, README komprehensif, dependency usang hilang.

---

## ✅ FASE 3 — Branding & Theme Decoupling
**Estimasi:** 2 jam · **Risiko:** rendah · **Nilai jual tertinggi: "ganti brand = edit 1 file"**

### Tujuan
Semua brand terpusat. Ini yang membuat produk bisa dijual ke orang berbeda tanpa menyunting 9 file.

### Latar Belakang
Saat ini nama produk tersebar di 9 titik (§3.3). Kalau pembeli ingin mengganti nama, dia harus grep dan edit 9 file — rawan kelewatan, tidak dokumentable.

### Langkah

**3.1 — Buat `src/config/branding.ts`** (BARU)
```ts
export const BRANDING = {
  productName: "ReBot",           // GANTI INI
  tagline: "Telegram Bot Dashboard",
  description: "Kelola bot auto-reply Telegram multi-akun dari satu dashboard.",
  companyName: "",                // opsional
  supportUrl: "",
  telegramChannel: "",
  // Ikon/logo — taruh file di /public/branding/ dan refer di sini
  logoPath: "/branding/logo.svg",
  faviconPath: "/branding/favicon.svg",
} as const;

export const APP_STORAGE_KEYS = {
  theme: "rebot-theme",   // ganti nama key →olls migrasi
  session: "rebot-session",
} as const;
```
> **Penting:** nama key `teleoffer-theme` → `rebot-theme` **mengganggu** user yang sudah menyimpan preferensi tema. Jika ini deployed ulang ke instalasi existing, tambahkan migrasi satu kali di `App.tsx` (baca key lama, tulis ke baru, hapus lama). Jika hanya untuk produk baru, abaikan migrasi.

**3.2 — Ganti 9 titik brand**

| File:Line | Sebelum | Sesudah |
|---|---|---|
| `index.html:6` | `content="TeleOffer - Telegram Bot Dashboard"` | `content="ReBot - Telegram Bot Dashboard"` (atau generik, agar tidak perlu diubah tiap branding) |
| `index.html:13` | `<title>TeleOffer Dashboard</title>` | `<title>ReBot Dashboard</title>` |
| `index.html:7` | `theme-color="#0a0a0b"` | `<meta name="theme-color" content="ReBot - Telegram Bot Dashboard" />` → biarkan netral |
| `LoginPage.tsx:177` | `<h1>TeleOffer</h1>` | `<h1>{BRANDING.productName}</h1>` |
| `App.tsx:78` | `localStorage.getItem("teleoffer-theme")` | `localStorage.getItem(APP_STORAGE_KEYS.theme)` |
| `App.tsx:102` | `localStorage.setItem("teleoffer-theme", theme)` | `localStorage.setItem(APP_STORAGE_KEYS.theme, theme)` |
| `App.tsx:279` | `teleoffer-full-backup-*.json` | `\`${BRANDING.productName.toLowerCase()}-full-backup-...\`` |
| `AccountProfile.tsx:613` | `teleoffer-backup-*.json` | `\`${BRANDING.productName.toLowerCase()}-backup-...\`` |
| `LogsPage.tsx:240` | `teleoffer-logs-today-*.txt` | `\`${BRANDING.productName.toLowerCase()}-logs-today-...\`` |
| `LogsPage.tsx:714` | `root@teleoffer:~# tail -f ...` | `root@${BRANDING.productName.toLowerCase()}:~# tail -f ...` |
| `InspectPage.tsx:690` | `deploy repositori LunoxyTelebot ini` | `deploy repositori ${BRANDING.productName} ini` |
| `Dockerfile:1` | `# Dockerfile for LunoxyTelebot` | `# Dockerfile for ReBot` |
| `capacitor.config.ts:2-3` | `com.shelly.lunoxytelebot` / `lunoxy-telebot` | `com.rebot.dashboard` / `rebot` |
| `package.json` | `"name": "react-example"` | sudah diubah di Fase 2 |

> `index.html` **tidak bisa** import TS. Solusinya: set title/description generik ("Dashboard" / "Telegram Bot Dashboard"), lalu set dari React di `main.tsx` atau `App.tsx`:
> ```ts
> document.title = `${BRANDING.productName} Dashboard`;
> ```

**3.3 — Buat `public/branding/`**
Taruh `logo.svg` + `favicon.svg` placeholder (SVG netral, tanpa teks). Update `<link rel="icon">` di `index.html`.

**3.4 — Tokenisasi theme (opsional tapi sangat direkomendasikan)**

Pindahkan 5 blok `[data-theme="..."]` dari `index.css:8-107` ke file terpisah bila menyulitkan:
- **Opsi A (minimal, cukup untuk penjual):** biarkan apa adanya. Warnanya sudah token-based (`var(--accent)`), dan `App.tsx` sudah mendukung 5 tema + picker. Pembeli bisa ganti warna dengan edit 20 baris CSS.
- **Opsi B (rapih):** buat `src/config/theme.ts` berisi definisi 5 tema sebagai objek `{ id, label, tokens: {...} }`, lalu generate CSS var via `useEffect` di `App.tsx`. Menghapus `index.css` 100 baris hardcode.

> Rekomendasi: **kerjakan Opsi A dulu** (cepat, risiko rendah, pembeli sudah bisa ganti brand). Opsi B hanya bila ada waktu luang. Yang wajib dari Opsi B hanya: pastikan **tidak ada hex color inline di JSX**. Cek `grep -rn "#[0-9a-fA-F]\{6\}" src/ --include=*.tsx` - hasil ideal hanya di `PinkAestheticBg.tsx` dan props chart library.

### Verification
```bash
npx tsc --noEmit && npm run build
grep -rni "teleoffer\|lunoxy\|celiimut" src/ backend/ server.ts index.html Dockerfile capacitor.config.ts package.json
# harus 0 hasil (kecuali catatan historis yang memang disengaja)
grep -rn "BRANDING\." src/    # harus menemukan pemakaian di titik-titik yang benar
```
| # | Uji | Ekspektasi |
|---|---|---|
| 1 | Edit `BRANDING.productName` → `"NamaToko"` | Judul tab, header, nama file download, dan teks InspectPage berubah semua |
| 2 | Tiap tema (obsidian/phantom/blood/frost/pink) dipilih | Warna konsisten, tidak ada elemen unstyled |
| 3 | Refresh halaman | Tema bertahan (localStorage) |
| 4 | Export backup & log | Nama file memakai brand baru |
| 5 | `grep` brand lama | 0 hasil |

### Deliverable
`branding.ts` sebagai single source of truth. Ganti brand = ubah 1 baris.

---

## ✅ FASE 4 - Refactor Monolith (ZERO KEHILANGAN FUNGSI)
**Estimasi:** 6-8 jam · **Risiko:** tinggi · **Butuh verifikasi ketat di setiap file**

### Tujuan
 pecah file raksasa jadi modul kecil **tanpa mengubah satu pun perilaku**.

> ### ⚠️ ATURAN KERAS FASE INI
> Ini fase paling berisiko. Aturan tambahan:
> 1. **Satu file pada satu waktu.** Selesai + verify + commit → baru file berikutnya. Jangan batch.
> 2. **Perilaku harus identik.** Kalau kamu ragu apakah suatu kode memengaruhi output, **jangan** dipindah. Tandai dengan `// DEAD_CODE_CANDIDATE` dan lanjutkan.
> 3. **Jangan gabungkan dengan perubahan lain.** Tidak ada "sambil improves" di fase ini.

### 4.0 — Persiapan (WAJIB)

**4.0.1 - Nyalakan type strict, tapi siapkan dulu**
```jsonc
// tsconfig.json — tambahkan
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true,
```
> **CARA AMAN menyalakan `strict`:** bakal muncul banyak error (terutama implicit-any di file besar). Plan yang benar: **fix `server.ts` & `backend/` DULU** (bagian 4.1), baru nyalakan `strict` di commit terpisah. Menyalakan `strict` di awal = badai error yang menutupi masalah asli.

**4.0.2 — Characterization test untuk helper murni**

Buat test untuk fungsi yang paling murni & paling kritis (tidak butuh Telegram):
- `backend/utils/KeywordIndex.ts` — `match()` (kata kunci → rule)
- `backend/utils/matching.ts` — `checkConfiguredTarget()`, `matchesSingleKeyword()`, `formatTargetId()`, `toIdVariants()`
- `backend/repositories/StatsRepository.ts` — funnel event math

Setup: `npm install -D vitest`, tambahkan `"test": "vitest run"` ke scripts.
> Tulis test yang **mendeskripsikan perilaku saat ini**, bukan perilaku ideal. Kalau test gagal saat kamu belum mengubah apa pun, berarti test-nya salah — perbaiki test, bukan kode.

### 4.1 — `server.ts` (1638 LOC) → pecah

**Urutan pemecahan (takut failure rendah → tinggi):**

| # | Ekstrak ke | Isi | Estimasi |
|---|---|---|---|
| 1 | `backend/config/app.ts` | Bootstrap Express: `app`, `createServer`, middleware, PORT | 30m |
| 2 | `backend/services/SocketService.ts` | `io`, `broadcastLog()`, `pushErrorLog()`, `errorLogHistory`, wiring `io.on("connection")` | 45m |
| 3 | `backend/services/AccountRegistry.ts` | `liveClients`, `accounts`, `pendingAuthByAccount`, `upsertAccount()`, `saveAccounts()` | 45m |
| 4 | **`backend/services/BotCore.ts`** | `handleIncomingMessage()` (~200 baris, inti logika), `setupBotCore()`, `getDiscussionMsgId()`, `resolveReplyTarget()`, `resolveDiscussionReplyTarget()`, `getLinkedChatCandidates()` | 90m |
| 5 | **`backend/services/MessageQueue.ts`** | `responseQueueByAccount`, `processingQueueAccounts`, `queuedReplySet`, `addToQueue()`, `processQueue()`, semua cooldown Map | 60m |
| 6 | `backend/services/PollingService.ts` | `startPollingFallback()`, `pollCursorByTarget`, `pollingTimerByAccount`, `pollingAccounts` | 45m |
| 7 | `backend/services/ReconnectService.ts` | `autoReconnectAll()`, DC-5 patch | 30m |
| 8 | `backend/services/TelegramErrors.ts` | `TELEGRAM_ERROR_GUIDE` (kamus ~40 entri, `server.ts:296-362`) + `describeSendError()` | 30m |
| 9 | `server.ts` -> **target akhir < 250 LOC** | Hanya: import, DI, wiring semua router, auto-start | - |

> **Peringatan khusus `BotCore` (#4) dan `MessageQueue` (#5):** keduanya adalah inti bot dan paling rawan. Ekstrak dengan **copy-paste dengan gangguan minimal**: pindahkan kode apa adanya, ubah hanya `import`/`export`, pertahankan nama variabel lokal persis. Jangan "sambil merapikan".

> **Peringasan `TELEGRAM_ERROR_GUIDE` (#8):** kamus ini contains pesan Bahasa Indonesia yang **tampil di UI pengguna** (bukan log server). Saat ekstrak, pastikan string tidak berubah 1 karakter pun — user relying pada pesan itu.

**Verifikasi tiap ekstrak:**
```bash
npx tsc --noEmit
npm run dev
#Lalu manual: login → Dashboard → aktifkan 1 akun → kirim pesan berisi keyword
# di grup target → pastikan balasan terkirim → cek tab Logs & Certainty Funnel
# counter (heard, keyword, sent) naik sesuai ekspektasi
```

### 4.2 — `src/components/AccountProfile.tsx` (1062 LOC)

Folder `src/components/account-profile/` sudah ada pola (`sections/` 11 file + `modals/` 4 file + `types.ts` + `index.ts`). **Ikuti pola yang sudah ada** — jangan ciptakan struktur baru.

Tambahkan yang belum ada (pola: satu section per file, props callback):
- Pisahkan blok state/logika yang tersisa ke hook: `useAccountProfileState()`
- Komponen utama hanya orkestrasi: `<TabNav />` + render section aktif
- Evaluasi: `sections/` yang ada sudah 113-241 LOC per file — konsisten, ikuti

### 4.3 — `src/pages/InspectPage.tsx` (1052 LOC)

Pecah ke `src/pages/inspect/`:
```
inspect/
├── index.tsx              (orquestrasi, < 250 LOC)
├── RailwayPanel.tsx       (status deploy, env check)
├── DeployGuide.tsx        (langkah deploy — teks BRANDING dari Fase 3)
├── DiagnosticsList.tsx    (daftar check + status)
└── hooks/useDiagnostics.ts (fetch logic)
```
> `InspectPage.tsx:690` mengandung teks `LunoxyTelebot` yang sudah diganti di Fase 3 — pastikan tidak ter-revert.

### 4.4 — `src/pages/LogsPage.tsx` (1040 LOC)

Pecah ke `src/pages/logs/`:
```
logs/
├── index.tsx
├── LogViewer.tsx          (virtualized list, auto-scroll)
├── LogFilters.tsx         (search + filter chips)
├── LogStatsBar.tsx        (count per tipe)
├── LogExport.tsx          (download TXT harian — BRANDING aware)
└── hooks/useLogs.ts
```

### 4.5 — `src/pages/AIPage.tsx` (836 LOC)

Pecah ke `src/pages/ai/`:
```
ai/
├── index.tsx
├── AiConfigForm.tsx       (API key, model, prompt — pakai AiConfigRepository)
├── AiStatsPanel.tsx       (pakai AIStatsChart)
├── AiFunnelBreakdown.tsx
└── hooks/useAiConfig.ts
```

### 4.6 — `src/App.tsx` (724 LOC)

Ekstrak hooks ke `src/hooks/`:
```
hooks/
├── useSocketLogs.ts       (socket.io: bot-log, error-log, flood-wait, account-disconnect)
├── useAccounts.ts         (loadConfig, add/remove/rename/toggle)
├── useStats.ts            (loadStats)
├── useTheme.ts            (theme state + localStorage — pakai APP_STORAGE_KEYS)
└── useAuth.ts             (session check, login, logout)
```
`App.tsx` → target **< 400 LOC**: layout shell + routing + komposisi.

> `activePage` di `App.tsx:88-98` memakai nested ternary. Rapikan jadi object map `{ "/logs": "logs", ... }[pathname] ?? "dash"` - lebih mudah dibaca, output identik.

### 4.7 — Backend `any` reduction

File dengan `any` terbanyak, urut prioritas:
1. `backend/routes/accountRoutes.ts` (~21) — sudah punya `AuthRouterDependencies` interface, **ikuti pola itu** untuk router lain
2. `backend/services/AIService.ts` (~10) — response Gemini perlu type eksplisit
3. `backend/utils/matching.ts` (~9) — peer/chat dari GramJS, buat interface minimal
4. `backend/services/BroadcastService.ts` (~9)
5. `backend/routes/logsRoutes.ts` (12), `settingsRoutes.ts` (9), `backend/utils/KeywordIndex.ts` (9)

> Jangan pakai `as any` untuk "memperbaiki" error. Kalau perlu cast, tulis interface-nya.

### Verification (setelah SETIAP file, bukan di akhir)
```bash
npx tsc --noEmit && npm run build && npm run dev
npx vitest run                          # characterization tests tetap hijau
```
**Smoke test manual wajib (repetisi setiap selesai 1 file):**

| # | Uji | Ekspektasi |
|---|---|---|
| 1 | Boot server | Tidak ada crash, log bersih |
| 2 | Login | Berhasil (test Fase 1) |
| 3 | Buka 5 halaman | Dashboard, Logs, AI, Inspect, Settings — semua render |
| 4 | Buka Account Profile | 15 section + 4 modal terbuka, tidak ada error console |
| 5 | Aktifkan akun + kirim keyword test | Balasan terkirim |
| 6 | Cek Certainty Funnel | Counter naik (heard → keyword → sent) |
| 7 | Export backup & restore | File valid, restore berhasil |
| 8 | Cek tab Logs realtime | Log baru muncul tanpa refresh |
| 9 | Ganti tema | 5 tema semua OK |

> Kalau ada yang gagal: `git revert` commit terakhir. Jangan menumpuk fix di atas refactor yang gagal.

### Deliverable
Tidak ada file > 600 LOC. `server.ts` < 250. Semua test hijau. Perilaku 100% identik.

---

## ✅ FASE 5 — Internationalization (i18n)
**Estimasi:** 3 jam | **Risiko:** sedang | **Nilai:** bergantung pada target pembeli

> **TENTUKAN DULU — jangan kerjakan sebelum ditanya manusia.** Kalau pembeli(target `teman`) berbahasa Indonesia, Fase 5 bisa di-skip atau ditunda. Kalau ada buyerilingual, ini wajib — 362 string hardcoded = rewrite besar. **Tanyakan ke pemilik proyek dulu.**

### Langkah (hanya jika diputuskan perlu)

**5.1 — Setup**
```bash
npm install i18next react-i18next
npm install -D @types/i18next
```
`src/i18n/index.ts`, `src/i18n/locales/id.json`, `src/i18n/locales/en.json`

**5.2 — Ekstrak string dari JSX**

Cari & ganti `362 string Indonesia hardcoded`. Tools yang membantu:
```bash
grep -rn '>[A-Za-z][a-z]\+ [a-z]\+[^<]*<' src/ --include=*.tsx   # candidate JSX text
grep -rn '"[A-Z][a-z]\+ [a-z]' src/ --include=*.tsx                 # candidate string props
```

**5.3 — Yang TIDAK diterjemahkan (biarkan Indonesia):**
- **Semua pesan `TELEGRAM_ERROR_GUIDE`** (`server.ts:296-362`) — output runtime ke user akhir, bukan UI dashboard
- Semua string di `broadcastLog(...)` — log runtime
- Pesan error dari Telegram (upstream)

> Kalau diterjemahkan, pembeli non-Indonesia tidak bisa diagnose error Telegram - dan itu justru use case utama dashboard ini.

**5.4 — Language switcher** di `SettingsPage` (sudah ada, `SettingsPage.tsx:97` LOC —ruvang untuk dropdown)

### Verification
```bash
npx tsc --noEmit && npx vitest run
# Manual: ganti bahasa ke EN → semua label berubah, tidak ada string Indonesia tersisa di UI
grep -rn '"[A-Z][a-z]\+ [a-z]' src/ --include=*.tsx | wc -l   # turun drastis
```
| # | Uji | Ekspektasi |
|---|---|---|
| 1 | Ganti ke English | Semua label UI English |
| 2 | Ganti ke Indonesia | Semua label Indonesia, identik dengan sebelum |
| 3 | Refresh | Bahasa bertahan |
| 4 | Cek error Telegram | Tetap Bahasa Indonesia (sesuai aturan 5.3) |

### Deliverable
UI bisa bilingual. Log runtime tetap Indonesia.

---

## ✅ FASE 6 — Testing & Quality Gates
**Estimasi:** 2-3 jam · **Risiko:** rendah · **WAJIB — ini jaring pengaman produk**

### Latar Belakang
Repo **tidak punya satu pun test**. Untuk produk yang dijual, ini liability besar — kalau ada regresi, pembeli tidak bisa blaming siapa pun selain penjual.

### Langkah

**6.1 — Tests untuk helper murni (highest ROI, paling mudah)**
- `backend/utils/KeywordIndex.ts` → `match()`: keyword sederhana, frasa, wildcard, case-insensitive, tanpa match
- `backend/utils/matching.ts` → `checkConfiguredTarget()`, `matchesSingleKeyword()`, `formatTargetId()`, `toIdVariants()`, `normalizeTarget()`

**6.2 — Tests untuk logika queue**
- `MessageQueue`: dedupe (pesan sama 2× = 1 kiriman), rate limit per-grup, cooldown FLOOD_WAIT

**6.3 — Tests untuk repository (pakai temp dir)**
- `SettingsRepository` / `AccountRepository`: read-write-read roundtrip
- Auto-backup: export → restore → data identik

**6.4 — Tests untuk pipeline filter**
Urutkan input → cek tahap mana yang menolak:
- Emoji prefix ditolak/t diterima
- Allowed senders: match by username / by signature / by fwd channel / ditolak
- Blocked words: contains / single-char edge case / regex-special chars
- Target group: match / no match

**6.5 — Integration smoke test**
```ts
// scripts/smoke.ts — boot server di port acak, hit endpoint wajib, assert, shutdown
// Dijalankan: npm run test:smoke
```
Minimal: `/api/auth/login` (401 → 200), `/api/auth/session`, `/api/config` (butuh auth → 200), `/api/stats?days=7`, `/api/logs`.

**6.6 — Tambah ESLint**
```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks
```
`.eslintrc` → `recommended` + `react-hooks` + `@typescript-eslint/no-explicit-any: "warn"`.
Update `package.json`:
```json
"lint": "tsc --noEmit && eslint .",
"typecheck": "tsc --noEmit",
"test": "vitest run"
```

### Verification
```bash
npm run lint        # exit 0
npx tsc --noEmit    # exit 0
npm test            # semua hijau
npm run build       # sukses
npm run test:smoke  # exit 0
```
| # | Uji | Ekspektasi |
|---|---|---|
| 1 | `npm test` | Semua hijau, 0 failed |
| 2 | `npm run lint` | 0 error |
| 3 | Sengaja break satu test | Test gagal -> gating bekerja |
| 4 | `npm run test:smoke` | Semua endpoint sehat |

### Deliverable
Test suite + lint gate. CLI bisa validate sebelum deploy.

---

## ✅ FASE 7 — Finalisasi Produk Jual
**Estimasi:** 1 jam · **Risiko:** rendah**

### 7.1 — Checklist kebocoran data (WAJIB — iterate SATU PER SATU)
```bash
grep -rni "celiimut\|teleoffer\|lunoxy" src/ backend/ server.ts index.html Dockerfile capacitor.config.ts package.json
# → harus 0 hasil

grep -rn "369\|sessionString" data/    # JANGAN commit data/
git log --all -p | grep -i "sessionstring\|1AaBb\|AQAD\|celiimut"   # scan history!
# → harus 0 hasil. Kalau ada, PURGE history (git filter-repo / BFG) sebelum sharing
```
> **PENTING:** data asli pernah ada di working tree. Kalau sempat ter-commit di fase awal, `git log` masih menyimpan session string Though sudah dihapus. Scan history wajib.

**7.2 — Fresh-install test (WAJIB)**
Simulasikan pembeli dari nol:
```bash
git clone <repo-anda> /tmp/fresh-test   # clone dari repo, BUKAN copy folder
cd /tmp/fresh-test && npm install
cp .env.example .env                     # isi dengan dummy
npm run build && npm start
```
| # | Uji | Ekspektasi |
|---|---|---|
| 1 | Fresh clone | Tidak butuh file dari mesin asli |
| 2 | `npm install` | Tidak error |
| 3 | `npm run build` | Sukses |
| 4 | `npm start` | Boot, login dengan creds dummy berhasil |
| 5 | Dashboard | Kosong (tidak ada akunWpribadi) |
| 6 | Tambah 1 akun | Berhasil |
| 7 | Buka Logs/AI/Inspect/Settings | Semua render |

**7.3 — Verify Railway deployment tetap berfungsi**
Deploy branch ke Railway staging, cek:
- Volume ter-mount untuk `/app/data`
- Login berhasil
- 1 akun bisa connect + kirim balasan
- Restart container → session masih ada (bukti volume bekerja)

**7.4 — Lisensi & legal**
- Tambah `LICENSE` (MIT proprietary / commercial / GPL — **tanyakan ke pemilik**)
- Tambah `CHANGELOG.md`
- Pastikan README menyebut syarat: patuh ToS Telegram, tanpa garansi, tanggung jawab pembeli

**7.5 — Handoff checklist ke pembeli**
- [ ] README instalasi + deploy + env vars
- [ ] Cara ganti brand (poin ke `src/config/branding.ts`)
- [ ] Cara ganti tema/warna (`src/index.css`)
- [ ] Daftar env vars wajib
- [ ] Troubleshooting umum
- [ ] Kontak support (kalau ada)
- [ ] Contoh config.json (tanpa data asli)

### Deliverable
Produk bersih dari data asli, teruji dari fresh clone, siap dijual.

---

## 5. Ringkasan Ketogenes

| Fase | Nama | Estimasi | Risiko | Reversible? | Blocker? |
|---|---|---|---|---|---|
| 0 | Baseline & Ignore | 15m | rendah | — | **YA** |
| 1 | Auth Hardening | 2-3j | sedang-tinggi | ya (git) | **YA** |
| 2 | Junk Cleanup | 1j | rendah | ya | — |
| 3 | Branding/Theme | 2j | rendah | ya | — |
| 4 | Refactor Monolith | 6-8j | **tinggi** | ya (git) | — |
| 5 | i18n | 3j | sedang | ya | — |
| 6 | Testing & Lint | 2-3j | rendah | ya | — |
| 7 | Finalisasi | 1j | rendah | ya | — |

**Total: ± 3-4 hari kerja.**

### Wave Paralel yang Aman (untuk AI lain yang paralel)
- Fase 2 & 3 bisa berjalan **bersamaan** (file berbeda)
- Fase 4.2–4.6 (frontend) bisa paralel dengan 4.7 (backend types)
- **Jangan paralelkan:** Fase 4.1 (server.ts) dengan apa pun yang menyentuh import dari `server.ts`

---

## 6. Appendix — Referensi Cepat

### 6.1 — Perintah
```bash
npm run dev            # dev server (tsx server.ts)
npm run build          # vite build → dist/
npm start              # production server
npm run lint           # tsc --noEmit
npx tsc --noEmit       # typecheck murni
npm test               # vitest run (setelah Fase 6)
npm run gen:hash -- "pw"   # bcrypt hash untuk DASHBOARD_PASS_HASH

# PowerShell
git status
git log --oneline
git diff
```

### 6.2 — Konvensi Kode yang Harus Diikuti
| Aspek | Konvensi |
|---|---|
| Indentasi | 2 spasi |
| Quote | Double quote |
| Semicolon | Ada |
| Import | Relative di dalam modul (`./x`, `../x`), named exports |
| Backend DI | Router menerima dependencies via object parameter — **ikuti pola `createAuthRouter(deps)`** |
| Type | Named interface, bukan inline type |
| Naming | `camelCase` fungsi/variabel, `PascalCase` komponen, `SCREAMING_SNAKE` konstanta |

### 6.3 — Pola DI yang Sudah Ada (copy ini)
`backend/routes/authRoutes.ts:17-31` — `AuthRouterDependencies` interface + `createAuthRouter(deps)`. Ini adalah pola yang benar untuk modularitas. Router `accountRoutes` (664 LOC) yang paling perlu dipecah dengan pola ini.

### 6.4 — File yang Sudah Modular (JANGAN di-refactor ulang)
```
backend/routes/       ✅ sudah dipisah per domain
backend/services/     ✅ sudah dipisah
backend/repositories/ ✅ sudah dipisah
backend/utils/        ✅ sudah dipisah
src/components/account-profile/  ✅ sudah dipisah (sections/ + modals/)
```
Fase 4 fokus pada: `server.ts`, `AccountProfile.tsx`, `InspectPage.tsx`, `LogsPage.tsx`, `AIPage.tsx`, `App.tsx`.

### 6.5 — Data Runtime (jangan commit, jangan dihapus tanpa izin)
```
data/accounts.json          ← 8 session string Telegram ASLI (sensitif)
data/settings.json
data/account_settings.json
data/stats.json
data/ai_config.json          ← berisi API key Gemini
data/logs/*.txt              ← log historis
data/backups/
media/                       ← media owner
.env                        ← GEMINI_API_KEY asli
```

### 6.6 —Korner Case yang Harus Dijaga (hasil audit)
| Temuan | Kenapa penting |
|---|---|
| DC5 Telegram patch (`server.ts:21-45`) | Workaround Railway terhadap packet drop. **Jangan dihapus** — bot tidak akan connect. |
| Flood wait adaptive delay | `delay` antara 500ms-4000ms dengan cooldown. Ubah = spam banned. |
| `linkedChatCache`, `discussionCache` | Penting untuk reply di discussion group. |
| `processedMessageKeys` & `repliedThreadKeys` | Dedupe. Hilang = pesan dibalas berkali-kali. |
| Signature blocklist (`server.ts` handleIncomingMessage) | Filter anti-jebakan. Ada `"?"` yang berisi karakter aneh — jangan "rapikan". |
| `processedMessageKeys.size > 5000` → clear | Memory bound. Jangan diubah. |
| Media group send (`client.sendFile`) | Kirim album. Timeout di-`30s * jumlah file`. |

---

## 7. Checklist Setiap AI Agent

Sebelum mengedit:
- [ ] Sudah baca dokumen ini dari awal sampai akhir
- [ ] Sudah baca Aturan Mutlak (§1)
- [ ] Sudah cek `git status` — working tree bersih
- [ ] Sudah tahu fase mana yang sedang dikerjakan

Setelah mengedit:
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → sukses
- [ ] `npx vitest run` → semua hijau (jika Fase 6 selesai)
- [ ] Smoke test manual (§4.6 table) — **wajib, tidak bisa dilewatkan**
- [ ] Tidak ada file `.bak` / `-old` / `copy-of` yang dibuat
- [ ] Tidak ada secret yang masuk ke commit
- [ ] Commit dengan format `[Fase-N] deskripsi`
- [ ] Rangkum apa yang berubah & verified di laporan akhir

Jika ragu dengan suatu perubahan:
- **Jangan dilakukan.** Tandai `// TODO: perlu konfirmasi — <pertanyaan>` dan lanjutkan bagian lain yang jelas. Salah refactor lebih mahal daripada Debt kecil.

---

*Dokumen ini dibuat untuk eksekusi AI-assisted. Ikuti urutan, verifikasi tiap langkah, jangan skipping.*
*Terakhir diupdate: 2026-10-02 · Untuk ReBot v0.0.0 (pre-productization)*
