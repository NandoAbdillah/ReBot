import { Router } from "express";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ConnectionTCPObfuscated } from "telegram/network/connection/TCPObfuscated.js";
import { fetchWithTimeout } from "../utils/matching.js";
import { AccountRecord } from "../repositories/AccountRepository.js";
import { SettingsRepository, BotSettings } from "../repositories/SettingsRepository.js";
import { StatsRepository } from "../repositories/StatsRepository.js";
import { BroadcastService } from "../services/BroadcastService.js";

export interface AccountRouterDependencies {
  accounts: AccountRecord[];
  upsertAccount: (rec: AccountRecord) => void;
  removeAccount: (id: string) => void;
  saveAccounts: () => void;
  liveClients: Map<string, TelegramClient>;
  pendingAuthByAccount: Map<string, any>;
  getAccountSettings: (id: string) => BotSettings;
  setAccountSettings: (id: string, s: Partial<BotSettings>) => any;
  saveAccountSettings: () => void;
  accountSettingsMap: Map<string, BotSettings>;
  getGlobalSettings: () => BotSettings;
  pollingTimerByAccount: Map<string, NodeJS.Timeout>;
  pollingAccounts: Set<string>;
  processingQueueAccounts: Set<string>;
  responseQueueByAccount: Map<string, any[]>;
  setupBotCore: (accountId: string, client: TelegramClient) => void;
  broadcastLog: (
    msg: string,
    type?: "info" | "success" | "error" | "bot" | "warning" | "ai",
  ) => void;
  dailyStatsMap: Map<string, any>;
  getTodayKey: () => string;
  getErrorLogs: (accountId?: string) => any[];
}

export async function reconnectAccount(
  account: AccountRecord,
  deps: AccountRouterDependencies,
): Promise<boolean> {
  const accountId = account.accountId;
  if (!account.sessionString) return false;

  try {
    // 1. Putuskan client lama jika ada
    const oldClient = deps.liveClients.get(accountId);
    if (oldClient) {
      await oldClient.disconnect().catch(() => undefined);
    }

    // 2. Bersihkan timer polling lama
    const oldTimer = deps.pollingTimerByAccount.get(accountId);
    if (oldTimer) {
      clearInterval(oldTimer);
      deps.pollingTimerByAccount.delete(accountId);
    }

    // 3. Bersihkan status antrean di memory
    deps.processingQueueAccounts.delete(accountId);
    deps.pollingAccounts.delete(accountId);

    // 4. Inisialisasi client baru dengan patch IP DC 5
    const session = new StringSession(account.sessionString);
    await session.load();
    if (
      session.serverAddress === "91.108.56.148" ||
      (session.dcId === 5 && session.serverAddress !== "91.108.56.147")
    ) {
      session.setDC(5, "91.108.56.147", 443);
      const fixedStr = session.save();
      if (fixedStr && fixedStr !== account.sessionString) {
        account.sessionString = fixedStr;
        deps.upsertAccount(account);
        deps.saveAccounts();
      }
    }

    const client = new TelegramClient(
      session,
      account.apiId,
      account.apiHash,
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
      deps.broadcastLog(
        `[${accountId}] ❌ Reconnect gagal: Client tidak terhubung.`,
        "error",
      );
      return false;
    }

    const updatedSession = (client.session.save() as unknown as string) || "";
    if (updatedSession && updatedSession !== account.sessionString) {
      account.sessionString = updatedSession;
      deps.upsertAccount(account);
      deps.saveAccounts();
    }

    deps.liveClients.set(accountId, client);
    deps.setupBotCore(accountId, client);

    // Sync cache dialog
    client.getDialogs().catch(() => undefined);

    deps.broadcastLog(
      `[${accountId}] ✅ Reconnect berhasil! Bot terhubung ke Telegram.`,
      "success",
    );
    return true;
  } catch (err: any) {
    deps.broadcastLog(
      `[${accountId}] ❌ Reconnect gagal: ${err.message}`,
      "error",
    );
    return false;
  }
}

export function createAccountRouter(deps: AccountRouterDependencies) {
  const router = Router();

  // POST /api/accounts/start-all
  router.post("/accounts/start-all", (_req, res) => {
    deps.accounts.forEach((acc) => {
      deps.setAccountSettings(acc.accountId, { isActive: true });
      // Jika akun offline tapi punya session, hubungkan kembali otomatis
      if (acc.sessionString && !deps.liveClients.get(acc.accountId)?.connected) {
        reconnectAccount(acc, deps).catch(() => undefined);
      }
    });
    deps.broadcastLog("Semua akun telah DIAKTIFKAN (Start All).", "success");
    res.json({ success: true });
  });

  // POST /api/accounts/stop-all
  router.post("/accounts/stop-all", (_req, res) => {
    deps.accounts.forEach((acc) => {
      deps.setAccountSettings(acc.accountId, { isActive: false });
    });
    deps.broadcastLog("Semua akun telah DIMATIKAN (Stop All).", "error");
    res.json({ success: true });
  });

  // GET /api/config
  router.get("/config", (_req, res) => {
    const accountStatuses = deps.accounts.map((a) => ({
      accountId: a.accountId,
      connected: deps.liveClients.get(a.accountId)?.connected || false,
      hasSession: Boolean(a.sessionString),
      isActive: deps.getAccountSettings(a.accountId).isActive,
    }));
    res.json({
      connected: accountStatuses.some((a) => a.connected),
      accounts: accountStatuses,
      settings: deps.getGlobalSettings(),
      hasSession: accountStatuses.some((a) => a.hasSession),
    });
  });

  // GET /api/accounts
  router.get("/accounts", (_req, res) => {
    res.json({
      accounts: deps.accounts.map((a) => ({
        accountId: a.accountId,
        connected: deps.liveClients.get(a.accountId)?.connected || false,
        hasSession: Boolean(a.sessionString),
      })),
    });
  });

  // GET /api/error-logs
  router.get("/error-logs", (req, res) => {
    const accountId = req.query.accountId
      ? String(req.query.accountId).trim()
      : "";
    const filtered = deps.getErrorLogs(accountId);
    res.json({ logs: [...filtered].reverse(), total: filtered.length });
  });

  // GET /api/stats
  router.get("/stats", (_req, res) => {
    const days = Math.min(Number(_req.query.days) || 30, 90);
    const accountFilter = _req.query.account
      ? String(_req.query.account).trim()
      : "";
    const result: { date: string; success: number; failed: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const stats = deps.dailyStatsMap.get(key) || {
        success: 0,
        failed: 0,
        byAccount: {},
      };
      if (accountFilter && stats.byAccount[accountFilter]) {
        result.push({
          date: key,
          success: stats.byAccount[accountFilter].success,
          failed: stats.byAccount[accountFilter].failed,
        });
      } else if (accountFilter) {
        result.push({ date: key, success: 0, failed: 0 });
      } else {
        result.push({ date: key, success: stats.success, failed: stats.failed });
      }
    }
    // Also include today's total for the stat card
    const todayEntry = deps.dailyStatsMap.get(deps.getTodayKey()) || {
      success: 0,
      failed: 0,
      byAccount: {},
    };
    const todayStats =
      accountFilter && todayEntry.byAccount[accountFilter]
        ? {
            success: todayEntry.byAccount[accountFilter].success,
            triggerSuccess:
              todayEntry.byAccount[accountFilter].triggerSuccess ??
              Math.max(
                0,
                todayEntry.byAccount[accountFilter].success -
                  (todayEntry.byAccount[accountFilter].broadcastSuccess || 0)
              ),
            broadcastSuccess: todayEntry.byAccount[accountFilter].broadcastSuccess ?? 0,
            failed: todayEntry.byAccount[accountFilter].failed,
          }
        : {
            success: todayEntry.success,
            triggerSuccess:
              todayEntry.triggerSuccess ??
              Math.max(0, todayEntry.success - (todayEntry.broadcastSuccess || 0)),
            broadcastSuccess: todayEntry.broadcastSuccess ?? 0,
            failed: todayEntry.failed,
          };
    const funnelToday = StatsRepository.getFunnelToday();
    const isAnyActive = deps.accounts.some((a) => deps.getAccountSettings(a.accountId).isActive);
    const smartAdvice = StatsRepository.getSmartAdvice(
      funnelToday,
      todayStats.success,
      todayStats.failed,
      isAnyActive,
      deps.accounts.length
    );

    // Collect all unique account IDs across all days
    const allAccountIds = new Set<string>();
    for (const [, s] of deps.dailyStatsMap) {
      for (const id of Object.keys(s.byAccount || {})) allAccountIds.add(id);
    }

    res.json({
      daily: result,
      today: todayStats,
      funnelToday,
      smartAdvice,
      totalSuccess: result.reduce((s, v) => s + v.success, 0),
      totalFailed: result.reduce((s, v) => s + v.failed, 0),
      accounts: Array.from(allAccountIds),
    });
  });

  // GET /api/account/:accountId/info
  router.get("/account/:accountId/info", async (req, res) => {
    const accId = String(req.params.accountId || "").trim();
    const client = deps.liveClients.get(accId);
    if (!client?.connected)
      return res.json({
        phone: null,
        username: null,
        firstName: null,
        lastName: null,
      });
    try {
      const me: any = await client.getMe();
      res.json({
        firstName: me?.firstName || null,
        lastName: me?.lastName || null,
        username: me?.username || null,
        phone: me?.phone || null,
      });
    } catch {
      res.json({ phone: null, username: null, firstName: null, lastName: null });
    }
  });

  // GET /api/accounts/:accountId/health
  router.get("/accounts/:accountId/health", async (req, res) => {
    const accountId = String(req.params.accountId || "").trim();
    const account = deps.accounts.find((a) => a.accountId === accountId);
    if (!account) {
      return res.status(404).json({ error: "Akun tidak ditemukan" });
    }

    const settings = deps.getAccountSettings(accountId);
    const client = deps.liveClients.get(accountId);
    const connected = client?.connected || false;

    const anomalies: string[] = [];
    let status = "healthy";
    let ping: number | null = null;
    let username: string | null = null;
    let phone: string = "";

    if (!account.sessionString) {
      status = "needs_otp";
      anomalies.push("Sesi login belum dibuat. Butuh verifikasi OTP.");
    } else if (!connected) {
      status = "unhealthy";
      anomalies.push("Koneksi bot terputus dari Telegram.");
    } else if (client) {
      try {
        const startTime = Date.now();
        const me: any = await client.getMe();
        ping = Date.now() - startTime;
        username = me?.username || null;
        phone = me?.phone || phone;
      } catch (err: any) {
        status = "banned";
        anomalies.push(
          `Gagal autentikasi dengan Telegram (Kemungkinan diblokir/deaktivasi): ${err.message}`,
        );
      }
    }

    if (settings.isActive === false) {
      anomalies.push(
        "Bot dalam mode STANDBY (isActive = off). Bot tidak akan merespons pesan.",
      );
    }

    if (!settings.targetGroups || settings.targetGroups.length === 0) {
      if (!settings.autoDetect) {
        anomalies.push("Target group belum diisi dan Auto Detect mati.");
      }
    }

    if (!settings.responses || settings.responses.length === 0) {
      anomalies.push("Belum ada keyword respon yang diatur.");
    }

    const targetDiagnostics: any[] = [];

    if (client && connected) {
      for (const target of settings.targetGroups.filter(Boolean)) {
        try {
          const entity: any = await client.getEntity(target);
          let title = entity?.title || entity?.username || String(target);
          let type = entity?.className || "Unknown";
          let hasSendPermission = true;
          let diagnosticError: string | null = null;
          const leftChannel = entity.left === true;
          let leftDiscussion = false;
          let discussionTitle = "";
          let discussionId = "";

          try {
            if (entity.className === "Channel") {
              const full = await client.invoke(
                new Api.channels.GetFullChannel({ channel: entity }),
              );
              const linkedId = (full as any)?.fullChat?.linkedChatId;
              if (linkedId) {
                discussionId = `-100${linkedId}`;
                try {
                  const linkedEntity: any = await client.getEntity(
                    discussionId,
                  );
                  discussionTitle = linkedEntity.title || "";
                  leftDiscussion = (linkedEntity as any).left === true;
                } catch {
                  leftDiscussion = true;
                }
              }
            } else if (entity.className === "Chat") {
              await client.invoke(
                new Api.messages.GetFullChat({ chatId: entity.id }),
              );
            }
          } catch (innerErr: any) {
            hasSendPermission = false;
            diagnosticError = `Gagal verifikasi izin (Kemungkinan bot bukan admin/member atau diblokir): ${innerErr.message}`;
          }

          if (leftChannel) {
            hasSendPermission = false;
            diagnosticError =
              "Bot belum bergabung ke Channel/Grup ini (Status: LEFT).";
          } else if (discussionId && leftDiscussion) {
            hasSendPermission = false;
            diagnosticError = `Bot belum bergabung ke Grup Diskusi terkait: "${discussionTitle || discussionId}" (Status: LEFT). Pesan komentar tidak akan bisa dikirim.`;
          }

          targetDiagnostics.push({
            target,
            title,
            type,
            status: hasSendPermission ? "healthy" : "unhealthy",
            error: diagnosticError,
            hasSendPermission,
          });
        } catch (err: any) {
          targetDiagnostics.push({
            target,
            title: "Tidak Diketahui / Belum Gabung",
            type: "Unknown",
            status: "unhealthy",
            error: `Gagal mendapatkan entitas: ${err.message}. Pastikan bot sudah bergabung dan ID/username benar.`,
            hasSendPermission: false,
          });
        }
      }
    }

    const groupStatsToday = StatsRepository.getGroupStatsToday();
    const keywordStatsToday = StatsRepository.getKeywordStatsToday();
    const groupStats: Record<string, number> = {};
    for (const [gid, entry] of Object.entries(groupStatsToday)) {
      groupStats[gid] = entry.total;
    }

    res.json({
      accountId,
      status,
      connected,
      phone,
      username,
      ping,
      anomalies,
      groupStats,
      groupStatsToday,
      keywordStats: keywordStatsToday,
      targetDiagnostics,
    });
  });

  // POST /api/accounts/:accountId/refresh
  router.post("/accounts/:accountId/refresh", async (req, res) => {
    const accountId = String(req.params.accountId || "").trim();
    const account = deps.accounts.find((a) => a.accountId === accountId);
    if (!account) {
      return res.status(404).json({ error: "Akun tidak ditemukan" });
    }

    if (!account.sessionString) {
      return res
        .status(400)
        .json({ error: "Akun belum login (tidak ada session)" });
    }

    try {
      deps.broadcastLog(
        `[${accountId}] 🔄 Memulai refresh / reconnect manual...`,
        "info",
      );

      const ok = await reconnectAccount(account, deps);
      if (!ok) {
        return res
          .status(500)
          .json({ error: "Client tidak terhubung ke Telegram. Pastikan jaringan server stabil." });
      }

      res.json({
        success: true,
        message: "Bot berhasil direfresh dan direconnect!",
      });
    } catch (err: any) {
      deps.broadcastLog(
        `[${accountId}] ❌ Refresh gagal: ${err.message}`,
        "error",
      );
      res.status(500).json({ error: err.message || "Gagal merefresh bot" });
    }
  });

  // POST /api/accounts/:accountId/test-ping-group
  router.post("/accounts/:accountId/test-ping-group", async (req, res) => {
    const accountId = String(req.params.accountId || "").trim();
    const target = String(req.body?.target || "").trim();

    const account = deps.accounts.find((a) => a.accountId === accountId);
    if (!account) {
      return res.status(404).json({ error: "Akun tidak ditemukan" });
    }

    const client = deps.liveClients.get(accountId);
    if (!client || !client.connected) {
      return res
        .status(400)
        .json({ error: "Bot offline atau tidak terhubung ke Telegram" });
    }

    try {
      const entity: any = await client.getEntity(target);
      let targetSendEntity = entity;

      if (entity.className === "Channel") {
        const full = await client.invoke(
          new Api.channels.GetFullChannel({ channel: entity }),
        );
        const linkedId = (full as any)?.fullChat?.linkedChatId;
        if (linkedId) {
          targetSendEntity = await client.getEntity(`-100${linkedId}`);
        } else {
          return res.status(400).json({
            error:
              "Channel ini tidak memiliki Grup Diskusi (Komentar) yang terhubung. Komentar tidak dapat dikirim.",
          });
        }
      }

      // Kirim pesan diagnostic
      const testMsg = await client.sendMessage(targetSendEntity, {
        message: `🔧 [System Diagnostic Ping] Koneksi bot aktif & izin kirim valid. Pesan ini akan dihapus dalam 1 detik.`,
      });

      // Hapus pesan setelah 1 detik agar tidak mengganggu
      if (testMsg && testMsg.id) {
        setTimeout(async () => {
          try {
            await client.deleteMessages(targetSendEntity, [testMsg.id], {
              revoke: true,
            });
          } catch (delErr) {
            console.error("Gagal menghapus pesan diagnostic ping:", delErr);
          }
        }, 1000);
      }

      res.json({
        success: true,
        message: `Sukses! Ping dikirim & dihapus di "${targetSendEntity.title || target}"`,
      });
    } catch (err: any) {
      console.error("Gagal melakukan ping test:", err);
      res
        .status(500)
        .json({ error: err.message || "Gagal melakukan ping test" });
    }
  });

  // DELETE /api/accounts/:accountId
  router.delete("/accounts/:accountId", async (req, res) => {
    const accountId = String(req.params.accountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ error: "accountId wajib diisi" });
    }

    const account = deps.accounts.find((a) => a.accountId === accountId);
    if (!account) {
      return res.status(404).json({ error: "Akun tidak ditemukan" });
    }

    try {
      // 1. Putuskan client telegram jika aktif
      const client = deps.liveClients.get(accountId);
      if (client) {
        await client.disconnect().catch(() => undefined);
        deps.liveClients.delete(accountId);
      }

      // 2. Bersihkan polling timer
      const timer = deps.pollingTimerByAccount.get(accountId);
      if (timer) {
        clearInterval(timer);
        deps.pollingTimerByAccount.delete(accountId);
      }

      // 3. Bersihkan status dan queue di memory
      deps.responseQueueByAccount.delete(accountId);
      deps.processingQueueAccounts.delete(accountId);
      deps.pollingAccounts.delete(accountId);
      BroadcastService.stopAllForAccount(accountId);

      const pending = deps.pendingAuthByAccount.get(accountId);
      if (pending) {
        await pending.client.disconnect().catch(() => undefined);
        deps.pendingAuthByAccount.delete(accountId);
      }

      // 4. Hapus dari database list accounts & simpan
      deps.removeAccount(accountId);

      // 5. Hapus settings spesifik akun
      SettingsRepository.removeAccountSettings(accountId);

      deps.broadcastLog(
        `Akun "${accountId}" berhasil dihapus secara permanen.`,
        "info",
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("Gagal menghapus akun:", err);
      res.status(500).json({ error: err.message || "Gagal menghapus akun" });
    }
  });

  // POST /api/accounts/:accountId/rename
  router.post("/accounts/:accountId/rename", (req, res) => {
    const oldId = String(req.params.accountId || "").trim();
    const newId = String(req.body?.newId || "").trim();
    if (!oldId || !newId)
      return res.status(400).json({ error: "oldId dan newId wajib diisi" });
    if (oldId === newId) return res.status(400).json({ error: "Nama sama" });
    if (deps.accounts.find((a) => a.accountId === newId))
      return res.status(400).json({ error: "Nama sudah digunakan" });

    const account = deps.accounts.find((a) => a.accountId === oldId);
    if (!account) return res.status(404).json({ error: "Akun tidak ditemukan" });

    account.accountId = newId;

    const client = deps.liveClients.get(oldId);
    if (client) {
      deps.liveClients.set(newId, client);
      deps.liveClients.delete(oldId);
    }

    const acSettings = deps.accountSettingsMap.get(oldId);
    if (acSettings) {
      deps.accountSettingsMap.set(newId, acSettings);
      deps.accountSettingsMap.delete(oldId);
    }

    const timer = deps.pollingTimerByAccount.get(oldId);
    if (timer) {
      deps.pollingTimerByAccount.set(newId, timer);
      deps.pollingTimerByAccount.delete(oldId);
    }

    const queue = deps.responseQueueByAccount.get(oldId);
    if (queue) {
      deps.responseQueueByAccount.set(newId, queue);
      deps.responseQueueByAccount.delete(oldId);
    }

    if (deps.processingQueueAccounts.has(oldId)) {
      deps.processingQueueAccounts.delete(oldId);
      deps.processingQueueAccounts.add(newId);
    }
    if (deps.pollingAccounts.has(oldId)) {
      deps.pollingAccounts.delete(oldId);
      deps.pollingAccounts.add(newId);
    }

    deps.saveAccounts();
    deps.saveAccountSettings();
    deps.broadcastLog(`Akun "${oldId}" di-rename ke "${newId}".`, "info");
    res.json({ success: true, newId });
  });

  return router;
}
