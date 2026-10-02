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
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import path, { dirname, join } from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { TelegramClient } from "telegram";

// ─── Patch Telegram DC 5 (Mengatasi IP 91.108.56.148 Down / Packet Drop di Railway) ──
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

// ─── Repositories & Services ────────────────────────────────────────────────
import { PORT, MEDIA_DIR } from "./backend/config/storage.js";
import { requireAuth, requireAuthForSockets } from "./backend/config/auth.js";
import { AccountRepository, AccountRecord } from "./backend/repositories/AccountRepository.js";
import {
  SettingsRepository,
  BotSettings,
} from "./backend/repositories/SettingsRepository.js";
import { StatsRepository } from "./backend/repositories/StatsRepository.js";
import { AiConfigRepository } from "./backend/repositories/AiConfigRepository.js";
import { Logger } from "./backend/utils/Logger.js";
import { AIService } from "./backend/services/AIService.js";
import { AutoBackupService } from "./backend/services/AutoBackupService.js";
import { LogRetentionService } from "./backend/services/LogRetentionService.js";
import { BroadcastService } from "./backend/services/BroadcastService.js";
import { SocketService } from "./backend/services/SocketService.js";
import { MessageQueue } from "./backend/services/MessageQueue.js";
import { PollingService } from "./backend/services/PollingService.js";
import { BotCore } from "./backend/services/BotCore.js";
import { ReconnectService } from "./backend/services/ReconnectService.js";
import { invalidateKeywordIndex } from "./backend/utils/KeywordIndex.js";

// ─── Route Handlers ─────────────────────────────────────────────────────────
import { createDashboardAuthRouter } from "./backend/routes/dashboardAuthRoutes.js";
import { aiRouter } from "./backend/routes/aiRoutes.js";
import { createBroadcastRouter } from "./backend/routes/broadcastRoutes.js";
import { createLogsRouter } from "./backend/routes/logsRoutes.js";
import { createAccountRouter } from "./backend/routes/accountRoutes.js";
import { createSettingsRouter } from "./backend/routes/settingsRoutes.js";
import { createAuthRouter } from "./backend/routes/authRoutes.js";
import { createInspectRouter } from "./backend/routes/inspectRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PendingAuthState {
  accountId: string;
  apiId: number;
  apiHash: string;
  phone: string;
  phoneCodeHash?: string;
  client: TelegramClient;
}

// Inisialisasi DB & Auto-Backup Service
AccountRepository.load();
SettingsRepository.load();
StatsRepository.load();
AiConfigRepository.load();

const liveClients = new Map<string, TelegramClient>();
const pendingAuthByAccount = new Map<string, PendingAuthState>();
const accounts = AccountRepository.getAll();

AutoBackupService.init(() => liveClients);
LogRetentionService.init();

// ─── Express + Socket.IO ─────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Validasi handshake Socket.IO & Logger
io.use(requireAuthForSockets);
SocketService.init(io);
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

// ─── Inisialisasi Service Modular ───────────────────────────────────────────
MessageQueue.init({
  getClient: (id) => liveClients.get(id),
  broadcastLog,
});

PollingService.init({
  getClient: (id) => liveClients.get(id),
  getAllLiveClients: () => liveClients,
  broadcastLog,
  onIncomingMessage: BotCore.handleIncomingMessage,
});

BotCore.init({
  getClient: (id) => liveClients.get(id),
  broadcastLog,
});

ReconnectService.init({
  liveClients,
  broadcastLog,
});

// Proxy Settings Handlers
const getAccountSettings = (id: string) =>
  SettingsRepository.getAccountSettings(id);

const setAccountSettings = (id: string, s: Partial<BotSettings>) => {
  const result = SettingsRepository.setAccountSettings(id, s);
  if (result.changed) {
    AIService.clearCache();
    AutoBackupService.triggerAutoBackup();
    invalidateKeywordIndex(id);
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

// ─── Express Middleware & Routes ────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Rute autentikasi dashboard
app.use("/api/auth", createDashboardAuthRouter());

// Proteksi autentikasi untuk seluruh /api dan /media
app.use("/api", requireAuth);
app.use("/media", requireAuth, express.static(MEDIA_DIR));

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

// Accounts & Diagnostics & Stats Routes
app.use(
  "/api",
  createAccountRouter({
    accounts,
    upsertAccount: (rec: AccountRecord) => AccountRepository.upsert(rec),
    removeAccount: (id: string) => AccountRepository.remove(id),
    saveAccounts: () => AccountRepository.save(),
    liveClients,
    pendingAuthByAccount,
    getAccountSettings,
    setAccountSettings,
    saveAccountSettings,
    accountSettingsMap: SettingsRepository.accountSettingsMap,
    getGlobalSettings: () => SettingsRepository.getGlobalSettings(),
    pollingTimerByAccount: PollingService.pollingTimerByAccount,
    pollingAccounts: PollingService.pollingAccounts,
    processingQueueAccounts: MessageQueue.processingQueueAccounts,
    responseQueueByAccount: MessageQueue.responseQueueByAccount,
    setupBotCore: BotCore.setupBotCore,
    broadcastLog,
    dailyStatsMap: StatsRepository.dailyStatsMap,
    getTodayKey: () => StatsRepository.getTodayKey(),
    getErrorLogs: (accId) =>
      accId
        ? SocketService.errorLogHistory.filter((e) => e.accountId === accId)
        : SocketService.errorLogHistory,
  }),
);

// Logs Routes
app.use(
  "/api/logs",
  createLogsRouter({
    broadcastLog,
    getErrorLogs: (accId) =>
      accId
        ? SocketService.errorLogHistory.filter((e) => e.accountId === accId)
        : SocketService.errorLogHistory,
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
    getGlobalSettings: () => SettingsRepository.getGlobalSettings(),
    setGlobalSettings: (s) => {
      SettingsRepository.setGlobalSettings(s);
      AutoBackupService.triggerAutoBackup();
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
      PollingService.clearAll();
      MessageQueue.processingQueueAccounts.clear();
      MessageQueue.responseQueueByAccount.clear();
      MessageQueue.queuedReplySet.clear();
      BotCore.clearAll();
    },
    autoReconnectAll: ReconnectService.autoReconnectAll,
    onSettingsUpdated: () => {
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
    pollingTimerByAccount: PollingService.pollingTimerByAccount,
    upsertAccount: (rec: AccountRecord) => AccountRepository.upsert(rec),
    saveAccounts: () => AccountRepository.save(),
    setupBotCore: BotCore.setupBotCore,
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
    });
    app.use(vite.middlewares);
    app.get("*", (req, res) => {
      res.sendFile(join(__dirname, "index.html"));
    });
  } else {
    const distPath = join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(join(distPath, "index.html"));
    });
  }
}

// ─── Server Startup ─────────────────────────────────────────────────────────
if (process.env.TEST_MODE !== "true") {
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`[INFO] Server LilyBot berjalan di port ${PORT} (0.0.0.0)`);
    ReconnectService.autoReconnectAll();
  });
}
