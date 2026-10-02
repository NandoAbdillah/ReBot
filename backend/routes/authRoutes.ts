import { Router } from "express";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ConnectionTCPObfuscated } from "telegram/network/connection/TCPObfuscated.js";
import { fetchWithTimeout } from "../utils/matching.js";
import { AccountRecord } from "../repositories/AccountRepository.js";

export interface PendingAuthState {
  accountId: string;
  apiId: number;
  apiHash: string;
  phone: string;
  phoneCodeHash?: string;
  client: TelegramClient;
}

export interface AuthRouterDependencies {
  pendingAuthByAccount: Map<string, PendingAuthState>;
  liveClients: Map<string, TelegramClient>;
  pollingTimerByAccount: Map<string, NodeJS.Timeout>;
  upsertAccount: (rec: AccountRecord) => void;
  saveAccounts: () => void;
  setupBotCore: (accountId: string, client: TelegramClient) => void;
  setAccountSettings: (accountId: string, settings: any) => any;
  broadcastLog: (
    msg: string,
    type?: "info" | "success" | "error" | "bot" | "warning" | "ai",
  ) => void;
}

export function createAuthRouter(deps: AuthRouterDependencies) {
  const router = Router();

  // POST /api/tg/connect
  router.post("/connect", async (req, res) => {
    const { accountId, phone, apiId, apiHash } = req.body;

    if (!accountId || !phone || !apiId || !apiHash) {
      return res.status(400).json({
        error: "accountId, phone, apiId, dan apiHash wajib diisi secara manual!",
      });
    }

    let tempClient: TelegramClient | null = null;
    try {
      const oldPending = deps.pendingAuthByAccount.get(accountId);
      if (oldPending) {
        await oldPending.client.disconnect().catch(() => undefined);
        deps.pendingAuthByAccount.delete(accountId);
      }

      const clientApiId = Number(apiId);
      const clientApiHash = String(apiHash).trim();
      const cleanPhone = String(phone).replace(/[^0-9+]/g, "").trim();

      tempClient = new TelegramClient(
        new StringSession(""),
        clientApiId,
        clientApiHash,
        {
          connectionRetries: 5,
          connection: ConnectionTCPObfuscated,
          deviceModel: "StabilNet Server Bot",
          systemVersion: "Linux/NodeJS",
          appVersion: "1.0.0",
        },
      );

      await fetchWithTimeout(tempClient.connect(), 35000);

      const { phoneCodeHash } = await fetchWithTimeout(
        tempClient.sendCode(
          { apiId: clientApiId, apiHash: clientApiHash },
          cleanPhone,
        ),
        40000,
      );

      // Disimpan di map pending untuk digunakan di rute /verify nanti
      deps.pendingAuthByAccount.set(accountId, {
        accountId,
        apiId: clientApiId,
        apiHash: clientApiHash,
        phone: cleanPhone,
        phoneCodeHash,
        client: tempClient,
      });

      deps.broadcastLog(
        `[${accountId}] Kode OTP dikirim ke ${phone} via Manual API`,
        "info",
      );
      res.json({ success: true, phoneCodeHash });
    } catch (e: any) {
      if (tempClient) {
        await tempClient.disconnect().catch(() => undefined);
      }
      deps.broadcastLog(`[${accountId}] Gagal kirim OTP: ${e.message}`, "error");
      res.status(500).json({
        error:
          e.message ||
          "Gagal terhubung ke Telegram (Timeout / Koneksi Terputus). Silakan coba lagi.",
      });
    }
  });

  // POST /api/tg/verify
  router.post("/verify", async (req, res) => {
    const { accountId: rawAccountId, phone, code, password } = req.body;
    const accountId = String(rawAccountId || "").trim();
    if (!accountId) {
      return res.status(400).json({ error: "accountId wajib diisi" });
    }

    const pending = deps.pendingAuthByAccount.get(accountId);
    if (!pending) {
      return res
        .status(400)
        .json({ error: "Belum ada sesi connect untuk akun ini" });
    }

    try {
      await fetchWithTimeout(
        pending.client.start({
          phoneNumber: async () =>
            String(phone || pending.phone).replace(/[^0-9+]/g, "").trim(),
          phoneCode: async () => String(code || "").trim(),
          password: async () => String(password || "").trim(),
          onError: (e) => {
            throw e;
          },
        }),
        35000,
      );

      const oldLive = deps.liveClients.get(accountId);
      if (oldLive && oldLive !== pending.client) {
        await oldLive.disconnect().catch(() => undefined);
      }

      const oldTimer = deps.pollingTimerByAccount.get(accountId);
      if (oldTimer) {
        clearInterval(oldTimer);
        deps.pollingTimerByAccount.delete(accountId);
      }

      deps.liveClients.set(accountId, pending.client);
      const sessionString = String(pending.client.session.save());

      // Otomatis tersimpan ke file json dengan API ID kustom yang diinput tadi
      deps.upsertAccount({
        accountId,
        apiId: pending.apiId,
        apiHash: pending.apiHash,
        sessionString,
      });
      deps.saveAccounts();

      deps.setupBotCore(accountId, pending.client);
      deps.setAccountSettings(accountId, { isActive: true });
      deps.pendingAuthByAccount.delete(accountId);

      deps.broadcastLog(
        `[${accountId}] Akun berhasil terhubung dengan API ID Kustom!`,
        "success",
      );
      res.json({ success: true });
    } catch (e: any) {
      deps.broadcastLog(`[${accountId}] Verifikasi gagal: ${e.message}`, "error");
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
