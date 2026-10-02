import "dotenv/config";

// ─── Global Error Handlers (Mencegah Server Crash di Railway) ────────────────
process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message || String(reason || "Unhandled Promise Rejection");
  console.error("⚠️ [Process] Unhandled Rejection ditangkap (server tetap jalan):", msg);
});

process.on("uncaughtException", (err: any) => {
  const msg = err?.message || String(err || "Uncaught Exception");
  console.error("⚠️ [Process] Uncaught Exception ditangkap (server tetap jalan):", msg);
});
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ConnectionTCPObfuscated } from "telegram/network/connection/TCPObfuscated.js";
import { NewMessage } from "telegram/events/index.js";

// ─── Patch Telegram DC 5 (Mengatasi IP 91.108.56.148 Down / Packet Drop di Railway) ──
// IP default DC 5 di GramJS (91.108.56.148) saat ini mengalami packet drop/RTO di berbagai cloud provider.
// IP alternatif DC 5 (91.108.56.147) aktif normal dan responsif (~50ms).
const origGetDC = (TelegramClient.prototype as any).getDC;
(TelegramClient.prototype as any).getDC = async function (
  dcId: number,
  downloadDC = false,
  web = false,
) {
  if (dcId === 5) {
    return { id: 5, ipAddress: "91.108.56.147", port: 443 };
  }
  const dc = await origGetDC.call(this, dcId, downloadDC, web);
  if (dc && dc.ipAddress === "91.108.56.148") {
    dc.ipAddress = "91.108.56.147";
    dc.port = 443;
  }
  return dc;
};

const origConnect = TelegramClient.prototype.connect;
TelegramClient.prototype.connect = async function () {
  if (this.session) {
    if (
      this.session.serverAddress === "91.108.56.148" ||
      (this.session.dcId === 5 && this.session.serverAddress !== "91.108.56.147")
    ) {
      this.session.setDC(5, "91.108.56.147", 443);
    }
  }
  return origConnect.call(this);
};
import path, { dirname, join } from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

// ─── Import Data Access Layer (Repositories) ─────────────────────────────────
import { PORT, MEDIA_DIR, LOGS_DIR, DB_PATHS } from "./backend/config/storage.js";
import {
  AccountRepository,
  AccountRecord,
} from "./backend/repositories/AccountRepository.js";
import {
  SettingsRepository,
  BotSettings,
  sanitizeSettings,
  ReplyItem,
} from "./backend/repositories/SettingsRepository.js";
import { StatsRepository } from "./backend/repositories/StatsRepository.js";
import { AiConfigRepository } from "./backend/repositories/AiConfigRepository.js";

import { Logger } from "./backend/utils/Logger.js";
import { AIService } from "./backend/services/AIService.js";
import { AutoBackupService } from "./backend/services/AutoBackupService.js";
import { LogRetentionService } from "./backend/services/LogRetentionService.js";
import { BroadcastService } from "./backend/services/BroadcastService.js";
import { BroadcastJob } from "./backend/repositories/SettingsRepository.js";
import {
  fetchWithTimeout,
  normalizeTarget,
  normalizeNumericId,
  normalizeForKeyword,
  matchesSingleKeyword,
  containsKeyword,
  toIdVariants,
  matchesTarget,
  checkConfiguredTarget,
  formatTargetId,
  preview,
  buildTelegramMessageLink,
} from "./backend/utils/matching.js";
import { getKeywordIndex, invalidateKeywordIndex } from "./backend/utils/KeywordIndex.js";
import { aiRouter } from "./backend/routes/aiRoutes.js";
import { createBroadcastRouter } from "./backend/routes/broadcastRoutes.js";
import { createLogsRouter } from "./backend/routes/logsRoutes.js";
import { createAccountRouter } from "./backend/routes/accountRoutes.js";
import { createSettingsRouter } from "./backend/routes/settingsRoutes.js";
import { createAuthRouter } from "./backend/routes/authRoutes.js";
import { createInspectRouter } from "./backend/routes/inspectRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Gunakan folder dari env var DATA_DIR (Railway Volume), atau fallback ke folder saat ini (.)
const DATA_DIR = process.env.DATA_DIR || ".";

const ACCOUNTS_FILE = `${DATA_DIR}/accounts.json`;

// ─── Proxy Pattern (Strangler Fig) ───────────────────────────────────────────
export interface PendingAuthState {
  accountId: string;
  apiId: number;
  apiHash: string;
  phone: string;
  phoneCodeHash?: string;
  client: TelegramClient;
}

// Inisialisasi DB & Auto-Backup Service (Cek & recover dari Railway crash)
AccountRepository.load();
SettingsRepository.load();
StatsRepository.load();
AiConfigRepository.load();
AutoBackupService.init(() => liveClients);
LogRetentionService.init();

// Proxy Settings
const getAccountSettings = (id: string) =>
  SettingsRepository.getAccountSettings(id);
const setAccountSettings = (id: string, s: Partial<BotSettings>) => {
  const result = SettingsRepository.setAccountSettings(id, s);
  if (result.changed) {
    AIService.clearCache();
    AutoBackupService.triggerAutoBackup();
    invalidateKeywordIndex(id); // Rebuild keyword HashMap on next message
    // Restart broadcast jobs if bot is connected
    const client = liveClients.get(id);
    if (client?.connected) {
      BroadcastService.restartAll(
        id,
        result.settings.broadcastJobs || [],
        () => liveClients.get(id),
        broadcastLog,
      );
    }
  }
  return result;
};
const saveAccountSettings = () => {
  SettingsRepository.saveAccountSettings();
  AutoBackupService.triggerAutoBackup();
};
const accountSettingsMap = SettingsRepository.accountSettingsMap;

// Proxy Stats
const recordSendResult = (type: "success" | "failed", id?: string, groupId?: string, keyword?: string) =>
  StatsRepository.recordSendResult(type, id, groupId, keyword);
const dailyStatsMap = StatsRepository.dailyStatsMap;
const getTodayKey = () => StatsRepository.getTodayKey();

// Proxy Global Settings & Accounts
let botSettings = SettingsRepository.getGlobalSettings();
const saveSettings = () => SettingsRepository.setGlobalSettings(botSettings);

const accounts = AccountRepository.getAll();
const upsertAccount = (rec: AccountRecord) => AccountRepository.upsert(rec);
const removeAccount = (id: string) => AccountRepository.remove(id);
const saveAccounts = () => AccountRepository.save();

// State Memory
const liveClients = new Map<string, TelegramClient>();
const pendingAuthByAccount = new Map<string, PendingAuthState>();

// const saveAccounts = () =>
//   fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

// ─── Express + Socket.IO ─────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Serve media folder statically
app.use("/media", express.static(MEDIA_DIR));

// Upload media endpoint
app.post("/api/media/upload", (req, res) => {
  try {
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
      return res.status(400).json({ error: "filename dan base64 wajib diisi" });
    }

    const base64Data = base64.replace(/^data:.*;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const uniqueName = `${Date.now()}_${base.replace(/[^a-zA-Z0-9]/g, "_")}${ext}`;
    const filePath = path.join(MEDIA_DIR, uniqueName);

    fs.writeFileSync(filePath, buffer);
    res.json({ success: true, filename: uniqueName });
  } catch (err: any) {
    console.error("Gagal upload media:", err);
    res.status(500).json({ error: err.message || "Gagal mengunggah media" });
  }
});

// Dipangkas ke 30 agar log dashboard enteng dan hemat RAM
const MAX_LOG_HISTORY = 30;
const logHistory: {
  message: string;
  type: "info" | "success" | "error" | "bot";
  timestamp: string;
}[] = [];

// Inisialisasi Logger modular dan buat proxy legacy agar kode lama tidak error
Logger.init(io);
export const broadcastLog = (
  msg: string,
  type: "info" | "success" | "error" | "bot" | "warning" | "ai" = "info",
) => {

  if (type === "error") {
    console.error(`[ERROR] ${msg}`);
  }
  Logger.broadcastLog(msg, type);
};

// ─── Jam WIB yang konsisten (biar timestamp di dashboard match jam asli) ──────
// Sebelumnya new Date().toLocaleTimeString() ikut timezone server (Railway = UTC),
// jadi jamnya keliatan "ga realtime" padahal cuma beda timezone sama jam HP/laptop
// kamu (WIB / UTC+7). Helper ini memaksa selalu tampil dalam jam Indonesia.
const nowWIB = () =>
  new Date().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// ─── ERROR LOG KHUSUS (terpisah dari log umum) ───────────────────────────────
// Tujuan: setiap kali ada pesan GAGAL terkirim atau DIBLOKIR filter kata,
// detailnya (akun, target grup, keyword, isi pesan, kode error Telegram,
// alasan dalam bahasa manusia, dan pesan teknis asli) disimpan terstruktur di
// sini, bukan cuma jadi 1 baris string yang ambigu di log umum. Frontend bisa
// bikin halaman "Error Logs" terpisah yang subscribe ke event socket
// "error-log" ini (realtime) atau fetch riwayatnya lewat GET /api/error-logs.
export interface DetailedErrorLog {
  id: string;
  timestamp: string; // ISO 8601 (UTC) — akurat & bisa diformat ulang di frontend sesuai timezone user
  timeWIB: string; // sudah diformat jam Indonesia, siap pakai langsung
  accountId: string;
  stage:
  | "send_message"
  | "blocked_word"
  | "trigger_resolve"
  | "auth_send_otp"
  | "auth_verify"
  | "reconnect"
  | "resolve_target";
  target?: string; // label grup/channel tujuan (nama atau ID)
  keyword?: string; // keyword yang men-trigger pesan ini (kalau ada)
  messagePreview?: string; // potongan isi pesan terkait (max ~150 char)
  errorCode: string; // kode error Telegram, contoh: USER_BANNED_IN_CHANNEL, FLOOD_WAIT, BLOCKED_WORD
  reason: string; // penjelasan manusiawi (Bahasa Indonesia) kenapa ini terjadi
  technical: string; // pesan error mentah/asli dari Telegram API, buat debugging teknis
}

const MAX_ERROR_LOG_HISTORY = 300;
const errorLogHistory: DetailedErrorLog[] = [];
let errorLogSeq = 0;

const pushErrorLog = (
  entry: Omit<DetailedErrorLog, "id" | "timestamp" | "timeWIB">,
) => {
  const full: DetailedErrorLog = {
    id: `${Date.now()}-${errorLogSeq++}`,
    timestamp: new Date().toISOString(),
    timeWIB: nowWIB(),
    ...entry,
  };
  errorLogHistory.push(full);
  if (errorLogHistory.length > MAX_ERROR_LOG_HISTORY) errorLogHistory.shift();
  io.emit("error-log", full);
  return full;
};

// ─── Kamus Kode Error Telegram → Penjelasan Manusiawi ────────────────────────
// Biar pas baca log, Shelly (atau siapapun yang debug) langsung tahu artinya
// tanpa harus googling kode error Telegram satu-satu.
const TELEGRAM_ERROR_GUIDE: Record<string, string> = {
  FLOOD_WAIT:
    "Akun ini kena rate-limit Telegram karena kirim pesan terlalu cepat/sering. Bot otomatis menunggu sebelum mencoba kirim lagi.",
  USER_BANNED_IN_CHANNEL:
    "Akun ini sudah di-banned/dikeluarkan dari grup atau channel tersebut, jadi tidak bisa kirim pesan di sana sampai di-invite ulang.",
  CHAT_ADMIN_REQUIRED:
    "Akun butuh hak admin untuk mengirim pesan di grup ini (grup di-setting agar hanya admin yang bisa kirim).",
  CHAT_WRITE_FORBIDDEN:
    "Akun tidak punya izin menulis di grup/channel ini — kemungkinan grup di-lock read-only oleh admin.",
  CHAT_RESTRICTED:
    "Grup ini diberi batasan oleh Telegram/admin sehingga akun tidak bisa mengirim pesan.",
  USER_DEACTIVATED_BAN:
    "Akun Telegram ini sudah di-banned permanen oleh Telegram (terdeteksi sebagai spam bot).",
  USER_DEACTIVATED: "Akun Telegram ini sudah dihapus/dinonaktifkan pemiliknya.",
  CHANNEL_PRIVATE:
    "Grup/channel tidak bisa diakses lagi — kemungkinan akun dikeluarkan, link invite kadaluarsa, atau grupnya sudah dihapus/di-private-kan.",
  CHANNEL_INVALID:
    "Referensi channel/grup sudah tidak valid lagi di sisi Telegram (grup mungkin sudah dihapus).",
  PEER_ID_INVALID:
    "ID target (grup/topic) tidak valid lagi. Biasanya karena grup dihapus, atau ID-nya berubah setelah grup di-upgrade.",
  SLOWMODE_WAIT:
    "Grup tujuan mengaktifkan Slow Mode, jadi akun harus menunggu beberapa detik dulu sebelum bisa kirim pesan lagi.",
  MSG_ID_INVALID:
    "Pesan yang ingin di-reply sudah tidak ada lagi (kemungkinan terhapus duluan sebelum bot sempat membalas).",
  MESSAGE_TOO_LONG:
    "Isi balasan terlalu panjang, melebihi batas maksimal karakter pesan Telegram.",
  MESSAGE_EMPTY: "Isi balasan kosong sehingga tidak bisa dikirim.",
  TOPIC_CLOSED:
    "Topic/thread diskusi pada grup ini sudah ditutup oleh admin, tidak bisa membalas di sana lagi.",
  USER_IS_BLOCKED: "Akun ini sudah diblokir oleh penerima pesan/grup.",
  USER_PRIVACY_RESTRICTED:
    "Penerima mengaktifkan privasi yang mencegah akun ini mengirim pesan ke mereka.",
  AUTH_KEY_UNREGISTERED:
    "Sesi login akun ini sudah tidak valid/expired di sisi Telegram, akun perlu login ulang (connect & verifikasi OTP lagi).",
  AUTH_KEY_DUPLICATED:
    "Session string akun ini dipakai di lebih dari satu tempat secara bersamaan sehingga Telegram menolaknya. Login ulang untuk dapat session baru.",
  SESSION_REVOKED:
    "Sesi login akun ini di-revoke (misal dari menu 'Active Sessions' di app Telegram resmi). Perlu login ulang.",
  PHONE_NUMBER_INVALID: "Format nomor HP yang diinput tidak valid.",
  PHONE_CODE_INVALID: "Kode OTP yang dimasukkan salah.",
  PHONE_CODE_EXPIRED: "Kode OTP sudah kadaluarsa, minta kirim ulang OTP.",
  PHONE_CODE_EMPTY: "Kode OTP belum diisi.",
  API_ID_INVALID:
    "API ID / API Hash yang diinput salah atau tidak cocok dengan nomor HP ini.",
  SESSION_PASSWORD_NEEDED:
    "Akun ini mengaktifkan verifikasi 2 langkah (2FA), password cloud-nya wajib diisi saat verifikasi.",
  PASSWORD_HASH_INVALID:
    "Password 2FA (Two-Step Verification) yang diinput salah.",
  TIMEOUT:
    "Telegram tidak merespons dalam waktu yang wajar (API Timeout). Biasanya karena koneksi server lambat/putus sesaat, bukan masalah di konfigurasi bot.",
};

// Ambil "kode error" dari pesan error mentah Telegram, contoh:
// "400: USER_BANNED_IN_CHANNEL (caused by messages.SendMessage)" → "USER_BANNED_IN_CHANNEL"
// "420: FLOOD_WAIT_45 (caused by ...)" → "FLOOD_WAIT" (suffix angka dibuang biar match ke kamus)
const describeSendError = (
  err: any,
): { code: string; reason: string; technical: string } => {
  const technical = String(err?.message || err || "Unknown error");
  const match = technical.match(/[A-Z][A-Z0-9_]{3,}/);
  let code = match ? match[0] : "UNKNOWN";
  // Buang suffix angka di belakang (FLOOD_WAIT_45 -> FLOOD_WAIT) biar ketemu di kamus
  const baseCode = code.replace(/_\d+$/, "");
  if (TELEGRAM_ERROR_GUIDE[baseCode]) code = baseCode;
  if (technical.includes("API Timeout")) code = "TIMEOUT";
  const reason =
    TELEGRAM_ERROR_GUIDE[code] ||
    "Error ini belum dikenali di kamus internal — baca kolom 'technical' di bawah untuk detail asli dari Telegram, lalu bisa kita tambahkan penjelasannya ke kamus.";
  return { code, reason, technical };
};

io.on("connection", (socket) => {
  for (const entry of Logger.logHistory) socket.emit("bot-log", entry);
  for (const entry of errorLogHistory) socket.emit("error-log", entry);
  socket.emit("bot-log", {
    message: `Dashboard tersambung. ${Logger.logHistory.length} log persisten dimuat, ${errorLogHistory.length} error log cached.`,
    type: "info",
    timestamp: new Date().toISOString(),
  });
});

// ─── Utilities ────────────────────────────────────────────────────────────────

// Matching utilities & helpers extracted to backend/utils/matching.ts

const linkedChatCache = new Map<string, { candidates: string[]; expires: number }>();

const getLinkedChatCandidates = async (
  accountId: string,
  tgClient: TelegramClient,
  chat: any,
): Promise<string[]> => {
  if (!chat || (chat.className !== "Channel" && chat.className !== "Chat"))
    return [];
  const key = `${accountId}:${chat.className}:${String(chat.id || "")}`;
  const cached = linkedChatCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.candidates;

  try {
    const full =
      chat.className === "Channel"
        ? await tgClient.invoke(
          new Api.channels.GetFullChannel({ channel: chat }),
        )
        : await tgClient.invoke(
          new Api.messages.GetFullChat({ chatId: chat.id }),
        );
    const linkedId = (full as any)?.fullChat?.linkedChatId;
    const candidates = toIdVariants(linkedId);
    linkedChatCache.set(key, { candidates, expires: Date.now() + 10 * 60 * 1000 }); // 10 menit TTL
    return candidates;
  } catch {
    linkedChatCache.set(key, { candidates: [], expires: Date.now() + 2 * 60 * 1000 });
    return [];
  }
};

const matchesConfiguredTarget = (
  accountId: string,
  message: any,
  sender: any,
  chat: any,
  extraCandidates: string[] = [],
): string | null => {
  const settings = getAccountSettings(accountId);
  return checkConfiguredTarget(
    settings,
    message,
    sender,
    chat,
    extraCandidates,
  );
};

// ─── Message Queue ────────────────────────────────────────────────────────────

interface QueueTask {
  targetId: any;
  replyTo: number;
  message: string;
  mediaPaths?: string[];
  groupLabel: string; // nama/ID grup tujuan yang manusiawi, untuk keperluan logging
  keyword: string; // keyword yang men-trigger balasan ini, untuk keperluan logging
  configuredTargetId?: string;
  targetUsername?: string;
}

const responseQueueByAccount = new Map<string, QueueTask[]>();
const processingQueueAccounts = new Set<string>();
const queuedReplySet = new Set<string>();
// Menyimpan timestamp sampai kapan akun harus memakai delay lebih panjang (cooldown pasca FLOOD_WAIT)
const accountFloodCooldown = new Map<string, number>();
// Menyimpan timestamp sampai kapan target grup di-pause karena CHAT_WRITE_FORBIDDEN (mute admin)
const targetMuteCooldown = new Map<string, number>();
// Menyimpan timestamp event terakhir yang diterima akun via NewMessage event listener
const lastEventTimeByAccount = new Map<string, number>();
// Per-group rate limiting: track last send time per group to prevent rapid-fire replies to same group
const lastSendTimePerGroup = new Map<string, number>();
// Track consecutive successful sends per account for adaptive delay reduction
const consecutiveSuccessByAccount = new Map<string, number>();

// formatTargetId & preview extracted to backend/utils/matching.ts

const processQueue = async (accountId: string) => {
  const queue = responseQueueByAccount.get(accountId) || [];
  const client = liveClients.get(accountId);
  if (
    processingQueueAccounts.has(accountId) ||
    queue.length === 0 ||
    !client?.connected
  )
    return;

  processingQueueAccounts.add(accountId);

  try {
    const task = queue.shift();
    if (task) {
      try {
        // Per-group rate limiting: pastikan tidak kirim ke grup sama terlalu cepat (min 2 detik)
        const groupKey = `${accountId}:${formatTargetId(task.targetId)}`;
        const lastGroupSend = lastSendTimePerGroup.get(groupKey) || 0;
        const groupElapsed = Date.now() - lastGroupSend;
        if (groupElapsed < 2000) {
          await new Promise((r) => setTimeout(r, 2000 - groupElapsed));
        }

        if (task.mediaPaths && task.mediaPaths.length > 0) {
          // Kirim media album / single file dengan GramJS client.sendFile
          const sentResult: any = await fetchWithTimeout(
            client.sendFile(task.targetId, {
              file: task.mediaPaths.length === 1 ? task.mediaPaths[0] : task.mediaPaths,
              caption: task.message || undefined,
              replyTo: task.replyTo,
            }),
            30000 * Math.max(1, task.mediaPaths.length),
          );
          const sentMsgId = Array.isArray(sentResult) ? Number(sentResult[0]?.id || 0) : Number(sentResult?.id || 0);
          const directLink = buildTelegramMessageLink(task.targetUsername, task.targetId, sentMsgId);
          broadcastLog(
            `[${accountId}] ✅ ${directLink ? `${directLink} | ` : ""}MEDIA TERKIRIM ke grup "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}" | files="${task.mediaPaths.map((m) => path.basename(m)).join(", ")}" | replyTo=${task.replyTo}${sentMsgId ? ` | msgId=${sentMsgId}` : ""}`,
            "success",
          );
        } else {
          // Kirim teks biasa
          const sentResult: any = await fetchWithTimeout(
            client.sendMessage(task.targetId, {
              message: task.message,
              replyTo: task.replyTo,
            }),
            15000,
          );
          const sentMsgId = Number(sentResult?.id || 0);
          const directLink = buildTelegramMessageLink(task.targetUsername, task.targetId, sentMsgId);
          broadcastLog(
            `[${accountId}] ✅ ${directLink ? `${directLink} | ` : ""}TERKIRIM ke grup "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}" | balasan="${preview(task.message, 80)}" | replyTo=${task.replyTo}${sentMsgId ? ` | msgId=${sentMsgId}` : ""}`,
            "success",
          );
        }
        lastSendTimePerGroup.set(groupKey, Date.now());
        recordSendResult("success", accountId, task.configuredTargetId || formatTargetId(task.targetId), task.keyword || undefined);

        // Track consecutive success for adaptive delay
        const prevSuccess = consecutiveSuccessByAccount.get(accountId) || 0;
        consecutiveSuccessByAccount.set(accountId, prevSuccess + 1);

        // Adaptive delay: gunakan antiSpamDelay dari settings (clamp nilai aman: min 500ms, max 5000ms).
        const rawSetting = getAccountSettings(accountId).antiSpamDelay;
        let baseSetting = 800;
        if (typeof rawSetting === "number" && !isNaN(rawSetting)) {
          if (rawSetting > 0 && rawSetting < 10) {
            baseSetting = rawSetting * 1000;
          } else if (rawSetting < 500) {
            baseSetting = 500;
          } else {
            baseSetting = Math.min(rawSetting, 5000);
          }
        }

        const floodCooldownUntil = accountFloodCooldown.get(accountId) || 0;
        const isInCooldown = Date.now() < floodCooldownUntil;
        const consecutiveOk = consecutiveSuccessByAccount.get(accountId) || 0;

        // Adaptive: jika banyak sukses berturut-turut, kurangi delay (min 500ms)
        // Jika dalam cooldown, naikkan delay
        let delay: number;
        if (isInCooldown) {
          delay = Math.min(baseSetting * 2, 4000);
          consecutiveSuccessByAccount.set(accountId, 0);
        } else if (consecutiveOk > 10) {
          delay = Math.max(baseSetting * 0.7, 500);
        } else {
          delay = baseSetting;
        }
        await new Promise((r) => setTimeout(r, delay));
      } catch (err: any) {
        const { code, reason, technical } = describeSendError(err);

        if (code === "FLOOD_WAIT" || technical.includes("wait of") || code === "SLOWMODE_WAIT") {
          if (code === "SLOWMODE_WAIT") {
            StatsRepository.recordFunnelEvent("slowmode");
          } else {
            StatsRepository.recordFunnelEvent("flood");
          }
          const waitMatch = technical.match(/(\d+)\s+seconds/i) || technical.match(/FLOOD_WAIT_(\d+)/i) || technical.match(/\d+/);
          const rawSecs = parseInt(waitMatch?.[1] || waitMatch?.[0] || "10");
          const secs = Math.min(isNaN(rawSecs) ? 10 : rawSecs, 60);

          broadcastLog(
            `[${accountId}] ⏳ SLOWMODE / FLOOD WAIT (${secs}s) di "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}". ${reason}`,
            "warning",
          );
          pushErrorLog({
            accountId,
            stage: "send_message",
            target: `${task.groupLabel} (ID: ${formatTargetId(task.targetId)})`,
            keyword: task.keyword,
            messagePreview: task.mediaPaths && task.mediaPaths.length > 0 ? `[Media Group] ${task.mediaPaths.map((m) => path.basename(m)).join(", ")}` : preview(task.message),
            errorCode: code,
            reason: `${reason} (Slowmode/cooldown ${secs} detik)`,
            technical,
          });
          io.emit("flood-wait", {
            accountId,
            seconds: secs,
            until: Date.now() + secs * 1000,
          });

          // Set cooldown pada akun agar pengiriman berikutnya berjarak aman
          accountFloodCooldown.set(accountId, Date.now() + secs * 1000);
          consecutiveSuccessByAccount.set(accountId, 0);
          recordSendResult("failed", accountId, task.configuredTargetId || formatTargetId(task.targetId), task.keyword || undefined);
          // Wait the EXACT flood wait time (up to 30s cap for queue responsiveness)
          await new Promise((r) => setTimeout(r, Math.min(secs, 30) * 1000));
        } else {
          StatsRepository.recordFunnelEvent("delivery_failed");
          broadcastLog(
            `[${accountId}] ❌ GAGAL kirim ke grup "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}" | balasan="${task.mediaPaths && task.mediaPaths.length > 0 ? `[Media Group] ${task.mediaPaths.map((m) => path.basename(m)).join(", ")}` : preview(task.message, 80)}" | kode=${code} | sebab: ${reason}`,
            "error",
          );
          pushErrorLog({
            accountId,
            stage: "send_message",
            target: `${task.groupLabel} (ID: ${formatTargetId(task.targetId)})`,
            keyword: task.keyword,
            messagePreview: task.mediaPaths && task.mediaPaths.length > 0 ? `[Media Group] ${task.mediaPaths.map((m) => path.basename(m)).join(", ")}` : preview(task.message),
            errorCode: code,
            reason,
            technical,
          });
          if (code === "CHAT_WRITE_FORBIDDEN") {
            const targetKey = `${accountId}:${formatTargetId(task.targetId)}`;
            targetMuteCooldown.set(targetKey, Date.now() + 30 * 60 * 1000);
            broadcastLog(
              `[${accountId}] ⚠️ Akun terdeteksi di-MUTE/dilarang menulis di "${task.groupLabel}". Pengiriman ke grup ini di-pause otomatis selama 30 menit untuk mencegah penumpukan error gagal.`,
              "warning"
            );
          }
          recordSendResult("failed", accountId, task.configuredTargetId || formatTargetId(task.targetId));
        }
      }
    }
  } finally {
    processingQueueAccounts.delete(accountId);
    processQueue(accountId);
  }
};

const addToQueue = (
  accountId: string,
  targetId: any,
  replyTo: number,
  message?: string,
  mediaPaths?: string[],
  groupLabel: string = "",
  keyword: string = "",
  configuredTargetId: string = "",
  targetUsername: string = "",
) => {
  const replyKey = mediaPaths && mediaPaths.length > 0
    ? `${accountId}:${replyTo}:media:${mediaPaths.join(",")}`
    : `${accountId}:${replyTo}:msg:${message || ""}`;

  if (queuedReplySet.has(replyKey)) {
    StatsRepository.recordFunnelEvent("skipped");
    return;
  }

  const targetMuteKey = `${accountId}:${formatTargetId(targetId)}`;
  const muteUntil = targetMuteCooldown.get(targetMuteKey) || 0;
  if (Date.now() < muteUntil) {
    // Target grup sedang di-mute untuk akun ini - lewati agar tidak spam gagal
    StatsRepository.recordFunnelEvent("skipped");
    return;
  }

  queuedReplySet.add(replyKey);
  if (queuedReplySet.size > 2000) queuedReplySet.clear();

  if (!responseQueueByAccount.has(accountId))
    responseQueueByAccount.set(accountId, []);
  const queue = responseQueueByAccount.get(accountId)!;
  queue.push({
    targetId,
    replyTo,
    message: message || "",
    mediaPaths,
    groupLabel: groupLabel || formatTargetId(targetId),
    keyword,
    configuredTargetId,
    targetUsername,
  });
  processQueue(accountId);
};


// ─── Message Processing ───────────────────────────────────────────────────────

const processedMessageKeys = new Set<string>();
const repliedThreadKeys = new Set<string>();
const pollCursorByTarget = new Map<string, number>();
const pollingTimerByAccount = new Map<string, NodeJS.Timeout>();
const pollingAccounts = new Set<string>();

const resolveReplyTarget = async (message: any, chat: any) => {
  try {
    const inputChat = await message?.getInputChat?.();
    if (inputChat) return inputChat;
  } catch { }
  if (chat) return chat;
  return message?.peerId;
};

const discussionCache = new Map<string, { data: { discussionMsgId: number; discussionChat: any } | null; expires: number }>();

const getDiscussionMsgId = async (
  tgClient: TelegramClient,
  channel: any,
  channelMsgId: number,
): Promise<{ discussionMsgId: number; discussionChat: any } | null> => {
  const key = `${String(channel?.id || "")}:${channelMsgId}`;
  const cached = discussionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const result: any = await tgClient.invoke(
      new Api.messages.GetDiscussionMessage({
        peer: channel,
        msgId: channelMsgId,
      }),
    );
    const msgs: any[] = result?.messages || [];
    const chats: any[] = result?.chats || [];
    if (!msgs.length) {
      discussionCache.set(key, { data: null, expires: Date.now() + 5 * 60 * 1000 });
      return null;
    }
    const discussionMsgId = Number(msgs[0]?.id || 0);
    if (!discussionMsgId) {
      discussionCache.set(key, { data: null, expires: Date.now() + 5 * 60 * 1000 });
      return null;
    }
    const discussionChat =
      chats.find((c: any) => c.megagroup) ||
      chats.find((c: any) => !c.broadcast) ||
      chats[0] ||
      null;
    const data = { discussionMsgId, discussionChat };
    discussionCache.set(key, { data, expires: Date.now() + 15 * 60 * 1000 });
    return data;
  } catch {
    discussionCache.set(key, { data: null, expires: Date.now() + 2 * 60 * 1000 });
    return null;
  }
};

const resolveDiscussionReplyTarget = async (
  accountId: string,
  tgClient: TelegramClient,
  chat: any,
) => {
  try {
    const candidates = await getLinkedChatCandidates(accountId, tgClient, chat);
    for (const candidate of candidates) {
      try {
        return await tgClient.getEntity(candidate);
      } catch { }
    }
  } catch { }
  return resolveReplyTarget(null, chat);
};

const handleIncomingMessage = async (
  accountId: string,
  tgClient: TelegramClient,
  message: any,
  source: "event" | "poll",
) => {
  const settings = getAccountSettings(accountId);
  if (!settings.isActive || !message) return;

  const rawText = String(message.message || "").trim();
  if (!rawText || message.out) return;

  // Catat ke corong funnel: bot mendengarkan pesan masuk di grup
  StatsRepository.recordFunnelEvent("heard");

  const msgText = rawText.toLowerCase();

  // ─── TAHAP 0 (FAST IN-MEMORY PRE-CHECK): EVALUASI KEYWORD VIA PRE-INDEXED HASHMAP ───
  // Menggunakan KeywordIndex untuk O(W) lookup (W=jumlah kata di pesan)
  // alih-alih O(N×M) regex compilations per pesan.

  const kwIndex = getKeywordIndex(
    accountId,
    settings.broadcastJobs || [],
    settings.responses || [],
  );

  const matchResult = kwIndex.match(msgText);

  let matchedBroadcastJob: any = null;
  let matchedBroadcastKw = "";
  let detectedKeyword = "";
  let matchedRule: any = null;

  if (matchResult) {
    if (matchResult.type === "broadcast") {
      matchedBroadcastJob = matchResult.rule;
      matchedBroadcastKw = matchResult.keyword;
    } else {
      detectedKeyword = matchResult.keyword;
      matchedRule = matchResult.rule;
    }
  }

  // JIKA TIDAK ADA KEYWORD YANG COCOK SAMA SEKALI, KELUAR INSTAN!
  if (!matchedBroadcastJob && !matchedRule) {
    return;
  }

  // Catat ke corong funnel: pesan cocok dengan keyword
  StatsRepository.recordFunnelEvent("keyword");

  // ─── TAHAP 1: EKSTRAK METADATA PENGIRIM & CHAT (Hanya jika keyword cocok) ───
  const sender: any = await message.getSender().catch(() => null);
  const chat: any = await message.getChat().catch(() => null);
  const peer: any = message?.peerId;

  // ─── EKSEKUSI BROADCAST JOB JIKA COCOK ───
  if (matchedBroadcastJob) {
    const linkedCandidates = await getLinkedChatCandidates(accountId, tgClient, chat);
    if (matchesTarget(matchedBroadcastJob.targetGroup, message, sender, chat, linkedCandidates)) {
      broadcastLog(
        `[${accountId}] [Broadcaster Trigger] Keyword "${matchedBroadcastKw}" cocok dengan Job "${matchedBroadcastJob.name}". Mengirim balasan...`,
        "bot",
      );

      const item = matchedBroadcastJob.items[Math.floor(Math.random() * matchedBroadcastJob.items.length)];
      if (item) {
        const mediaList = item.media || [];
        const mediaPaths = mediaList.map((m: string) => path.join(MEDIA_DIR, m));
        const groupLabel = chat?.title || chat?.username || matchedBroadcastJob.targetGroup;

        let replyTarget = chat || message?.peerId;
        let replyMsgId = Number(message.id || 0);

        const isFwd = Boolean((message as any)?.fwdFrom || (message as any)?.forward);
        const replyMeta: any = (message as any)?.replyTo;
        const sourceClass = String(chat?.className || "");

        const threadTopId = isFwd && sourceClass !== "Channel"
          ? Number(message.id || 0)
          : Number(replyMeta?.replyToTopId || 0) ||
          Number(replyMeta?.replyToMsgId || 0) ||
          Number(message.id || 0);

        if (String(chat?.className || "") === "Channel") {
          const disc = await getDiscussionMsgId(tgClient, chat, threadTopId);
          if (disc) {
            replyTarget = disc.discussionChat || (await resolveDiscussionReplyTarget(accountId, tgClient, chat));
            replyMsgId = disc.discussionMsgId;
          } else {
            replyTarget = await resolveDiscussionReplyTarget(accountId, tgClient, chat);
          }
        } else {
          replyTarget = await resolveReplyTarget(message, chat);
        }

        const targetUsername = chat?.username || (typeof matchedBroadcastJob.targetGroup === "string" && !matchedBroadcastJob.targetGroup.startsWith("-") ? matchedBroadcastJob.targetGroup : "");
        if (mediaPaths.length > 0) {
          addToQueue(accountId, replyTarget, replyMsgId, item.text || undefined, mediaPaths, groupLabel, matchedBroadcastKw, matchedBroadcastJob.targetGroup, targetUsername);
        } else {
          addToQueue(accountId, replyTarget, replyMsgId, item.text, undefined, groupLabel, matchedBroadcastKw, matchedBroadcastJob.targetGroup, targetUsername);
        }
        return;
      }
    }
  }

  // Jika bukan broadcast job, pastikan matchedRule ada
  if (!matchedRule) {
    StatsRepository.recordFunnelEvent("skipped");
    return;
  }

  // ─── TAHAP 1B: VALIDASI EMOJI & ALLOWED SENDERS ───
  if (settings.requireEmojiPrefix) {
    const startsWithEmoji = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(rawText.trim());
    if (!startsWithEmoji) {
      StatsRepository.recordFunnelEvent("skipped");
      broadcastLog(
        `[${accountId}] ⏭️ SKIP [Emoji Prefix]: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" dilewati — tidak dimulai dengan emoji`,
        "info",
      );
      return;
    }
  }

  if (settings.allowedSendersEnabled) {
    const rawPostAuthor = String((message as any)?.postAuthor || "").trim();
    const fwdPostAuthor = String((message as any)?.fwdFrom?.postAuthor || "").trim();
    const fwdFromName = String((message as any)?.fwdFrom?.fromName || "").trim();
    const signatures = [rawPostAuthor, fwdPostAuthor, fwdFromName].filter(Boolean);

    const signatureBlocklist = ["jgn reply", "jangan reply", "dont reply", "don't reply", "pembersihan", "cleanup", "‼️"];
    const hasBlockedSignature = signatures.some(sig => {
      const cleanSig = sig.toLowerCase();
      return signatureBlocklist.some(blocked => cleanSig.includes(blocked));
    });

    if (hasBlockedSignature) {
      StatsRepository.recordFunnelEvent("blocked", 1, "blocked_signature");
      broadcastLog(
        `[${accountId}] 🛑 BLOCKED: Pesan di "${chat?.title || "grup"}" diblokir karena signature mengandung kata jebakan: "${signatures.join(", ")}"`,
        "warning"
      );
      return;
    }

    const senderUsername = String(sender?.username || "").trim();
    const senderTitle = String(sender?.title || "").trim();
    const savedFromPeer = String((message as any)?.fwdFrom?.savedFromPeer || "").trim();
    const fwdChannelId = String((message as any)?.fwdFrom?.fromId?.channelId || "").trim();
    const chatTitle = String(chat?.title || "").trim();
    const chatUsername = String(chat?.username || "").trim();

    const allowedList = (settings.allowedSenders || []).filter(Boolean);
    if (allowedList.length > 0) {
      const identityCandidates = [
        senderUsername,
        senderTitle,
        savedFromPeer,
        fwdChannelId,
        chatTitle,
        chatUsername,
      ].filter(Boolean);

      const isIdentityAllowed = identityCandidates.some((identity) => {
        const normIdentity = identity.toLowerCase().replace(/[^a-z0-9]/g, "");
        return allowedList.some((allowed) => {
          const normAllowed = allowed.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normIdentity.includes(normAllowed);
        });
      });

      const isSignatureAllowed = signatures.some((sig) => {
        const normSig = sig.toLowerCase().replace(/[^a-z0-9]/g, "");
        return allowedList.some((allowed) => {
          const normAllowed = allowed.toLowerCase().replace(/[^a-z0-9]/g, "");
          return normSig === normAllowed;
        });
      });

      if (!isIdentityAllowed && !isSignatureAllowed) {
        StatsRepository.recordFunnelEvent("skipped");
        broadcastLog(
          `[${accountId}] ⚠️ SKIP: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" dilewati (Allowed Senders: ${allowedList.join(", ")}). [sender: "${senderTitle||senderUsername||"-"}", fwdCh: "${fwdChannelId||"-"}", chat: "${chatTitle||"-"}", sig: "${signatures.join(",")||"-"}"]`,
          "info",
        );
        return;
      }
    }
  }

  // ─── TAHAP 2: FILTER BLOCKED WORDS ───
  if (settings.filterWordsEnabled && settings.filterWords && settings.filterWords.length > 0) {
    let detectedBlockedWord = "";
    const isBlocked = settings.filterWords.some((word) => {
      const cleanW = String(word || "").trim();
      if (!cleanW || (cleanW.length === 1 && !/[a-z0-9]/i.test(cleanW))) return false;
      if (cleanW === "@" || /^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(cleanW)) return false;
      if (matchesSingleKeyword(msgText, cleanW)) {
        detectedBlockedWord = cleanW;
        return true;
      }
      return false;
    });

    if (isBlocked) {
      StatsRepository.recordFunnelEvent("blocked", 1, detectedBlockedWord);
      const groupName = chat?.title || chat?.username || "unknown";
      const groupId = formatTargetId(peer);
      broadcastLog(
        `[${accountId}] ⚠️ Pesan dicegat di grup "${groupName}" (ID: ${groupId})! Mengandung kata terlarang: [${detectedBlockedWord}]`,
        "warning",
      );
      return;
    }
  }

  // ─── TAHAP 3: AI INTENT GATEKEEPER ───
  const aiConfig = AiConfigRepository.getConfig();
  const cleanMsg = msgText.trim().replace(/[?.,!#/@\s]+/g, "");
  const cleanKw = detectedKeyword.trim().replace(/[?.,!#/@\s]+/g, "");
  const isExactKeywordTrigger = cleanMsg === cleanKw;

  if (
    aiConfig.isActive &&
    aiConfig.apiKeys &&
    aiConfig.apiKeys.length > 0 &&
    !isExactKeywordTrigger
  ) {
    try {
      const aiDecision: any = await AIService.evaluateIntent(
        msgText,
        detectedKeyword,
        aiConfig.apiKeys,
        settings.filterWords || [],
        settings.aiPrompt || undefined,
      );

      const infoAkun = aiDecision.keyName || "Akun-AI";
      const infoModel = aiDecision.model || "Model-AI";

      if (aiDecision.intent === "SKIP") {
        StatsRepository.recordFunnelEvent("skipped");
        broadcastLog(
          `[AI Intent] [Akun: ${infoAkun} | Model: ${infoModel}] SKIP: Bukan target. Kwd: "${detectedKeyword}" | Alasan: ${aiDecision.reason}`,
          "ai",
        );
        return;
      } else {
        broadcastLog(
          `[AI Intent] [Akun: ${infoAkun} | Model: ${infoModel}] PROMOSI: Niat valid. Kwd: "${detectedKeyword}" | Alasan: ${aiDecision.reason}`,
          "ai",
        );
      }
    } catch (aiErr: any) {
      if (aiErr.message?.includes("429")) {
        broadcastLog(
          `[AI Intent] Error Fatal (Semua Limit API Habis / 429).`,
          "ai",
        );
      } else {
        broadcastLog(
          `[AI Intent] Error evaluasi AI: ${aiErr.message}`,
          "ai",
        );
      }
    }
  }

  // ─── TAHAP 4: PARSE & PILIH 1 BALASAN ACAK (SINGLE RANDOMIZED REPLY) ───
  let matchReplies: ReplyItem[] = [];
  if (Array.isArray((matchedRule as any).replies)) {
    matchReplies = (matchedRule as any).replies.map((rep: any) => {
      if (typeof rep === "string") {
        return { text: rep, media: [] };
      }
      return {
        text: rep?.text || "",
        media: Array.isArray(rep?.media) ? rep.media : [],
      };
    });
  } else if (typeof (matchedRule as any).response === "string") {
    const parts = (matchedRule as any).response
      .split("|||")
      .map((s: string) => s.trim())
      .filter(Boolean);
    matchReplies = parts.map((text: string) => ({ text, media: [] }));
  }

  if (matchReplies.length === 0) {
    StatsRepository.recordFunnelEvent("skipped");
    return;
  }

  // Pilih 1 template balasan acak secara adil (snappy & no duplicate slowmode spam)
  const selectedReply = matchReplies[Math.floor(Math.random() * matchReplies.length)];
  if (!selectedReply) {
    StatsRepository.recordFunnelEvent("skipped");
    return;
  }

  const hasGroupPeer = Boolean(peer?.channelId || peer?.chatId);
  const isGroup = Boolean(
    hasGroupPeer ||
    (chat && (chat.className === "Chat" || chat.className === "Channel")),
  );
  if (!isGroup) {
    StatsRepository.recordFunnelEvent("skipped");
    broadcastLog(
      `[${accountId}] ⏭️ SKIP [Bukan Grup]: Pesan keyword "${detectedKeyword}" berasal dari chat privat/bukan grup`,
      "info",
    );
    return;
  }

  const replyMeta: any = (message as any)?.replyTo;
  const isFwd = Boolean((message as any)?.fwdFrom || (message as any)?.forward);
  const sourceClass = String(chat?.className || "");
  const fwdChannelPostIdEarly = Number(
    (message as any)?.fwdFrom?.channelPost || 0,
  );
  const isBroadcastChannel = Boolean((chat as any)?.broadcast);
  const isChannelPeer = Boolean(peer?.channelId);

  if (!isBroadcastChannel && !isChannelPeer) {
    if (sourceClass !== "Channel" && !fwdChannelPostIdEarly && !isFwd) {
      StatsRepository.recordFunnelEvent("skipped");
      broadcastLog(
        `[${accountId}] ⏭️ SKIP [Source Filter]: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" — bukan dari channel/forward (class=${sourceClass}, broadcast=${isBroadcastChannel}, channelPeer=${isChannelPeer})`,
        "info",
      );
      return;
    }
  }

  const isChannelForward = Boolean((message as any)?.fwdFrom?.channelPost);
  if (sender && sender.className === "User" && !sender.bot && !isChannelForward) {
    StatsRepository.recordFunnelEvent("skipped");
    broadcastLog(
      `[${accountId}] ⏭️ SKIP [Sender Filter]: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" — pengirim adalah user biasa (bukan bot/channel forward). Sender: "${sender?.username || sender?.firstName || "-"}"`,
      "info",
    );
    return;
  }

  const isForwardedIntoDiscussion = isFwd && sourceClass !== "Channel";
  const threadTopId = isForwardedIntoDiscussion
    ? Number(message.id || 0)
    : Number(replyMeta?.replyToTopId || 0) ||
    Number(replyMeta?.replyToMsgId || 0) ||
    Number(message.id || 0);

  const fwdChannelPostId = Number((message as any)?.fwdFrom?.channelPost || 0);
  const fwdChannelId = String(
    (message as any)?.fwdFrom?.fromId?.channelId || "",
  );
  const canonicalPeerId =
    fwdChannelId ||
    String(peer?.channelId || peer?.chatId || peer?.userId || "unknown");
  const canonicalMsgId = fwdChannelPostId || Number(message?.id || 0);
  const dedupeKey = `${accountId}:${canonicalPeerId}:${canonicalMsgId}`;

  if (processedMessageKeys.has(dedupeKey)) {
    StatsRepository.recordFunnelEvent("skipped");
    return;
  }
  processedMessageKeys.add(dedupeKey);
  if (processedMessageKeys.size > 5000) processedMessageKeys.clear();

  const linkedCandidates = await getLinkedChatCandidates(
    accountId,
    tgClient,
    chat,
  );
  const matchedTarget = matchesConfiguredTarget(accountId, message, sender, chat, linkedCandidates);
  if (!matchedTarget) {
    StatsRepository.recordFunnelEvent("skipped");
    const activeTargets = settings.targetGroups.filter(Boolean);
    const resolvedTargetId = formatTargetId(peer);
    broadcastLog(
      `[${accountId}] ⚠️ SKIP: Grup "${chat?.title || chat?.username || "unknown"}" (ID: ${resolvedTargetId}) tidak cocok dengan Target Groups yang diatur: [${activeTargets.join(", ")}].`,
      "info"
    );
    return;
  }

  const threadKey = `${accountId}:${canonicalPeerId}:${canonicalMsgId}:${detectedKeyword || "custom"}`;
  if (repliedThreadKeys.has(threadKey)) {
    StatsRepository.recordFunnelEvent("skipped");
    broadcastLog(
      `[${accountId}] ⏭️ SKIP [Duplikat Thread]: Thread ${threadKey} sudah pernah dibalas sebelumnya`,
      "info",
    );
    return;
  }

  repliedThreadKeys.add(threadKey);
  if (repliedThreadKeys.size > 10000) repliedThreadKeys.clear();

  broadcastLog(
    `[${accountId}] [TRIGGER][${source}] keyword="${detectedKeyword}" | teks="${rawText.slice(0, 100)}"`,
    "bot",
  );

  try {
    let effectiveChat = chat;
    if (isFwd) {
      const fwdFromId = (message as any)?.fwdFrom?.fromId;
      if (fwdFromId) {
        try {
          const resolved = await tgClient.getEntity(fwdFromId);
          if (resolved) effectiveChat = resolved;
        } catch { }
      }
    }

    let replyTarget: any;
    let replyMsgId = threadTopId;

    if (String(effectiveChat?.className || "") === "Channel") {
      const disc = await getDiscussionMsgId(
        tgClient,
        effectiveChat,
        threadTopId,
      );
      if (disc) {
        replyTarget =
          disc.discussionChat ||
          (await resolveDiscussionReplyTarget(
            accountId,
            tgClient,
            effectiveChat,
          ));
        replyMsgId = disc.discussionMsgId;
      } else {
        replyTarget = await resolveDiscussionReplyTarget(
          accountId,
          tgClient,
          effectiveChat,
        );
      }
    } else {
      replyTarget = await resolveReplyTarget(message, chat);
    }

    const groupLabel = chat?.title || chat?.username || formatTargetId(replyTarget);

    const targetUsername = chat?.username || (typeof matchedTarget === "string" && !matchedTarget.startsWith("-") ? matchedTarget : "");

    // Kirim 1 balasan terpilih ke antrean
    const mediaList = selectedReply.media || [];
    if (mediaList.length > 0) {
      const mediaPaths = mediaList.map((m: string) => path.join(MEDIA_DIR, m));
      addToQueue(accountId, replyTarget, replyMsgId, selectedReply.text || undefined, mediaPaths, groupLabel, detectedKeyword, matchedTarget, targetUsername);
    } else {
      addToQueue(accountId, replyTarget, replyMsgId, selectedReply.text, undefined, groupLabel, detectedKeyword, matchedTarget, targetUsername);
    }
  } catch (err: any) {
    broadcastLog(
      `[${accountId}] Error final execution: ${err.message}`,
      "error",
    );
  }
};

// ─── Polling Fallback ────────────────────────────────────────────────────────

const getLiveAccountId = (tgClient: TelegramClient, fallbackId: string): string => {
  for (const [id, client] of liveClients.entries()) {
    if (client === tgClient) return id;
  }
  return fallbackId;
};

const startPollingFallback = (accountId: string, tgClient: TelegramClient) => {
  if (pollingTimerByAccount.has(accountId)) return;

  const timer = setInterval(async () => {
    const currentId = getLiveAccountId(tgClient, accountId);
    const client = liveClients.get(currentId);
    const settings = getAccountSettings(currentId);

    if (client && !client.connected && settings.isActive) {
      broadcastLog(
        `[${currentId}] Bot terputus/offline. Mencoba reconnect...`,
        "error",
      );
      io.emit("account-disconnect", {
        accountId: currentId,
        reason: "Bot terputus dari Telegram",
      });
      try {
        await fetchWithTimeout(client.connect(), 30000);
        broadcastLog(`[${currentId}] Reconnect otomatis berhasil!`, "success");
      } catch (e) {
        return;
      }
    }

    if (
      pollingAccounts.has(currentId) ||
      !client?.connected ||
      !settings.isActive
    )
      return;
    const lastEvent = lastEventTimeByAccount.get(currentId) || 0;
    // Jika event handler aktif menerima pesan dalam 45 detik terakhir, lewati polling fallback agar hemat koneksi
    if (Date.now() - lastEvent < 45000) {
      return;
    }
    pollingAccounts.add(currentId);

    try {
      const targets = settings.targetGroups
        .map((t) => String(t || "").trim())
        .filter(Boolean);
      for (const target of targets) {
        try {
          let entity: any;
          try {
            entity = await tgClient.getEntity(target);
          } catch (err) {
            broadcastLog(
              `[${accountId}] 🔍 Cache target "${target}" tidak ditemukan. Mengambil list dialogs Telegram untuk sinkronisasi cache...`,
              "info"
            );
            await tgClient.getDialogs();
            entity = await tgClient.getEntity(target);
          }
          let pollEntities: any[] = [entity];

          if (entity?.className === "Channel") {
            try {
              const full = await tgClient.invoke(
                new Api.channels.GetFullChannel({ channel: entity }),
              );
              const linkedId = (full as any)?.fullChat?.linkedChatId;
              if (linkedId) {
                let linked: any;
                const linkedTargetStr = `-100${String(linkedId)}`;
                try {
                  linked = await tgClient.getEntity(linkedTargetStr);
                } catch {
                  await tgClient.getDialogs();
                  linked = await tgClient.getEntity(linkedTargetStr);
                }
                pollEntities = [linked];
              }
            } catch { }
          }

          for (const pollEntity of pollEntities) {
            const list: any[] = (await fetchWithTimeout(
              tgClient.getMessages(pollEntity, { limit: 20 }),
              15000,
            )) as any[];

            const sorted = [...(list || [])].sort(
              (a: any, b: any) => Number(a?.id || 0) - Number(b?.id || 0),
            );
            const targetKey = normalizeTarget(
              `${accountId}:${target}:${String(pollEntity?.id || "unknown")}`,
            );
            const hasCursor = pollCursorByTarget.has(targetKey);
            const cursor = pollCursorByTarget.get(targetKey) || 0;
            let maxSeen = cursor;

            if (!hasCursor) {
              const latestId = sorted.length
                ? Number(sorted[sorted.length - 1]?.id || 0)
                : 0;
              pollCursorByTarget.set(targetKey, latestId);
              
              // Proses pesan yang dikirim kurang dari 3 menit lalu (180 detik) meskipun cursor baru diinisialisasi
              const nowSec = Math.floor(Date.now() / 1000);
              for (const msg of sorted) {
                const msgDate = msg.date || 0;
                if (nowSec - msgDate < 180) {
                  await handleIncomingMessage(accountId, tgClient, msg, "poll");
                }
              }
              continue;
            }

            for (const msg of sorted) {
              const id = Number(msg?.id || 0);
              if (!id) continue;
              if (id <= cursor) {
                if (id > maxSeen) maxSeen = id;
                continue;
              }
              if (id > maxSeen) maxSeen = id;
              await handleIncomingMessage(accountId, tgClient, msg, "poll");
            }

            pollCursorByTarget.set(targetKey, maxSeen);
          }
        } catch (err: any) {
          broadcastLog(
            `[${accountId}] ❌ GAGAL memproses target "${target}" dalam polling fallback. Pastikan bot bergabung di grup/channel tersebut dan pemicu aktif. Detail: ${err.message}`,
            "error",
          );
        }
      }
    } finally {
      pollingAccounts.delete(accountId);
    }
  }, 20000); // Watchdog interval 20s

  pollingTimerByAccount.set(accountId, timer);
};

const setupBotCore = (accountId: string, tgClient: TelegramClient) => {
  startPollingFallback(accountId, tgClient);
  tgClient.addEventHandler(async (event) => {
    lastEventTimeByAccount.set(accountId, Date.now());
    await handleIncomingMessage(accountId, tgClient, event.message, "event");
  }, new NewMessage({}));

  // Start Auto Broadcaster jobs for this account
  const settings = getAccountSettings(accountId);
  BroadcastService.restartAll(
    accountId,
    settings.broadcastJobs || [],
    () => liveClients.get(accountId),
    broadcastLog,
  );
};

// ─── API Routes (Modular Routers) ───────────────────────────────────────────

// Accounts & Diagnostics & Stats Routes
app.use(
  "/api",
  createAccountRouter({
    accounts,
    upsertAccount,
    removeAccount,
    saveAccounts,
    liveClients,
    pendingAuthByAccount,
    getAccountSettings,
    setAccountSettings,
    saveAccountSettings,
    accountSettingsMap,
    getGlobalSettings: () => botSettings,
    pollingTimerByAccount,
    pollingAccounts,
    processingQueueAccounts,
    responseQueueByAccount,
    setupBotCore,
    broadcastLog,
    dailyStatsMap,
    getTodayKey,
    getErrorLogs: (accId) =>
      accId ? errorLogHistory.filter((e) => e.accountId === accId) : errorLogHistory,
  }),
);

// Logs Routes
app.use(
  "/api/logs",
  createLogsRouter({
    broadcastLog,
    getErrorLogs: (accId) =>
      accId ? errorLogHistory.filter((e) => e.accountId === accId) : errorLogHistory,
  }),
);

// Auto Broadcaster Job CRUD
app.use(
  "/api/account/:accountId/broadcast-jobs",
  createBroadcastRouter({
    getAccount: (id) => accounts.find((a) => a.accountId === id),
    getAccountSettings,
    setAccountSettings,
    broadcastLog,
  }),
);

// Settings, Import & Export Routes
app.use(
  "/api",
  createSettingsRouter({
    getAccountSettings,
    setAccountSettings,
    getGlobalSettings: () => botSettings,
    setGlobalSettings: (s) => {
      botSettings = s;
      saveSettings();
    },
    liveClients,
    broadcastLog,
    resetAllRuntimeState: async () => {
      for (const [accId, client] of liveClients.entries()) {
        try {
          await client.disconnect().catch(() => undefined);
          console.log(`[SYSTEM] Disconnected live client: ${accId}`);
        } catch (e: any) {
          console.error(`Gagal memutuskan koneksi bot ${accId}:`, e);
        }
      }
      liveClients.clear();

      for (const [, timer] of pollingTimerByAccount.entries()) {
        clearInterval(timer);
      }
      pollingTimerByAccount.clear();

      pollingAccounts.clear();
      processingQueueAccounts.clear();
      responseQueueByAccount.clear();
      pollCursorByTarget.clear();
      processedMessageKeys.clear();
      repliedThreadKeys.clear();
      queuedReplySet.clear();
    },
    autoReconnectAll,
    onSettingsUpdated: () => {
      botSettings = SettingsRepository.getGlobalSettings();
      accounts.length = 0;
      accounts.push(...AccountRepository.getAll());
    },
  }),
);

// Telegram Auth Routes (Connect & Verify)
app.use(
  "/api/tg",
  createAuthRouter({
    pendingAuthByAccount,
    liveClients,
    pollingTimerByAccount,
    upsertAccount,
    saveAccounts,
    setupBotCore,
    setAccountSettings,
    broadcastLog,
  }),
);

// AI Routes
app.use("/api/ai", aiRouter);

// Railway & Deployment Inspect Routes
app.use(
  "/api/deployment",
  createInspectRouter({
    getLiveClients: () => liveClients,
    broadcastLog,
  }),
);

// ─── Frontend Serving ────────────────────────────────────────────────────────

if (process.env.TEST_MODE !== "true") {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    // Development: Use Vite dev server
    const vite = await createViteServer({
      server: { middlewareMode: true },
    });
    app.use(vite.middlewares);

    app.get("*", (req, res) => {
      res.sendFile(join(__dirname, "index.html"));
    });
  } else {
    // Production: Serve built React app from dist/
    const distPath = join(__dirname, "dist");
    app.use(express.static(distPath));

    // SPA Fallback: All routes return index.html for React Router
    app.get("*", (req, res) => {
      res.sendFile(join(distPath, "index.html"));
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

if (process.env.TEST_MODE !== "true") {
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[INFO] Server berjalan di port ${PORT} (0.0.0.0)`);
    // Auto-reconnect semua akun yang tersimpan saat server startup
    autoReconnectAll();
  });
}

// ─── Auto-Reconnect on Startup ───────────────────────────────────────────────

async function autoReconnectAll() {
  const savedAccounts = accounts.filter((a) => a.sessionString);
  if (savedAccounts.length === 0) {
    console.log("[INFO] Tidak ada akun tersimpan untuk di-reconnect.");
    return;
  }

  broadcastLog(
    `Memulai auto-reconnect ${savedAccounts.length} akun secara paralel...`,
    "info",
  );

  const tasks = savedAccounts.map(async (acc) => {
    try {
      const settings = getAccountSettings(acc.accountId);

      const session = new StringSession(acc.sessionString);
      await session.load();
      if (
        session.serverAddress === "91.108.56.148" ||
        (session.dcId === 5 && session.serverAddress !== "91.108.56.147")
      ) {
        session.setDC(5, "91.108.56.147", 443);
        const fixedStr = session.save();
        if (fixedStr && fixedStr !== acc.sessionString) {
          acc.sessionString = fixedStr;
          upsertAccount(acc);
          saveAccounts();
        }
      }

      const client = new TelegramClient(
        session,
        acc.apiId,
        acc.apiHash,
        {
          connectionRetries: 5,
          connection: ConnectionTCPObfuscated,
          deviceModel: "StabilNet Server Bot",
          systemVersion: "Linux/NodeJS",
          appVersion: "1.0.0",
        },
      );

      await fetchWithTimeout(client.connect(), 30000);

      if (!client.connected) {
        broadcastLog(`[${acc.accountId}] Gagal reconnect — skip.`, "error");
        return;
      }

      // Auto update session in DB if changed
      const currentSavedSession = (client.session.save() as unknown as string) || "";
      if (currentSavedSession && currentSavedSession !== acc.sessionString) {
        acc.sessionString = currentSavedSession;
        upsertAccount(acc);
        saveAccounts();
      }

      // Disconnect old client if any
      const oldClient = liveClients.get(acc.accountId);
      if (oldClient && oldClient !== client) {
        await oldClient.disconnect().catch(() => undefined);
      }

      // Clear old polling timer
      const oldTimer = pollingTimerByAccount.get(acc.accountId);
      if (oldTimer) {
        clearInterval(oldTimer);
        pollingTimerByAccount.delete(acc.accountId);
      }

      liveClients.set(acc.accountId, client);
      setupBotCore(acc.accountId, client);

      // Pastikan isActive tetap sesuai yang tersimpan (jangan override ke false)
      if (settings.isActive) {
        broadcastLog(
          `[${acc.accountId}] ✅ Reconnect berhasil — bot AKTIF.`,
          "success",
        );
      } else {
        broadcastLog(
          `[${acc.accountId}] ✅ Reconnect berhasil — bot STANDBY (isActive=off).`,
          "info",
        );
      }
    } catch (err: any) {
      broadcastLog(
        `[${acc.accountId}] ❌ Reconnect gagal: ${err.message}`,
        "error",
      );
    }
  });

  await Promise.allSettled(tasks);
  broadcastLog("Auto-reconnect selesai.", "success");
}
