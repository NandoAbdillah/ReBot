/**
 * ReconnectService.ts
 * Mengelola proses auto-reconnect semua sesi Telegram tersimpan saat server boot
 * atau pasca reset konfigurasi, termasuk patch alamat DC-5 GramJS.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ConnectionTCPObfuscated } from "telegram/network/connection/TCPObfuscated.js";
import { AccountRepository, AccountRecord } from "../repositories/AccountRepository.js";
import { SettingsRepository } from "../repositories/SettingsRepository.js";
import { fetchWithTimeout } from "../utils/matching.js";
import { PollingService } from "./PollingService.js";
import { BotCore } from "./BotCore.js";

export interface ReconnectDependencies {
  liveClients: Map<string, TelegramClient>;
  broadcastLog: (msg: string, type?: "info" | "success" | "error" | "bot" | "warning" | "ai") => void;
}

export class ReconnectService {
  private static deps: ReconnectDependencies | null = null;

  public static init(deps: ReconnectDependencies) {
    ReconnectService.deps = deps;
  }

  public static async autoReconnectAll(): Promise<void> {
    const savedAccounts = AccountRepository.getAll().filter((a) => a.sessionString);
    if (savedAccounts.length === 0) {
      console.log("[INFO] Tidak ada akun tersimpan untuk di-reconnect.");
      return;
    }

    ReconnectService.deps?.broadcastLog(
      `Memulai auto-reconnect ${savedAccounts.length} akun secara paralel...`,
      "info",
    );

    const tasks = savedAccounts.map(async (acc: AccountRecord) => {
      try {
        const settings = SettingsRepository.getAccountSettings(acc.accountId);

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
            AccountRepository.upsert(acc);
            AccountRepository.save();
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
          ReconnectService.deps?.broadcastLog(`[${acc.accountId}] Gagal reconnect — skip.`, "error");
          return;
        }

        // Auto update session in DB if changed
        const currentSavedSession = (client.session.save() as unknown as string) || "";
        if (currentSavedSession && currentSavedSession !== acc.sessionString) {
          acc.sessionString = currentSavedSession;
          AccountRepository.upsert(acc);
          AccountRepository.save();
        }

        // Disconnect old client if any
        const oldClient = ReconnectService.deps?.liveClients.get(acc.accountId);
        if (oldClient && oldClient !== client) {
          await oldClient.disconnect().catch(() => undefined);
        }

        // Clear old polling timer
        PollingService.stopPolling(acc.accountId);

        ReconnectService.deps?.liveClients.set(acc.accountId, client);
        BotCore.setupBotCore(acc.accountId, client);

        if (settings.isActive) {
          ReconnectService.deps?.broadcastLog(
            `[${acc.accountId}] ✅ Reconnect berhasil — bot AKTIF.`,
            "success",
          );
        } else {
          ReconnectService.deps?.broadcastLog(
            `[${acc.accountId}] ✅ Reconnect berhasil — bot STANDBY (isActive=off).`,
            "info",
          );
        }
      } catch (err: any) {
        ReconnectService.deps?.broadcastLog(
          `[${acc.accountId}] ❌ Reconnect gagal: ${err.message}`,
          "error",
        );
      }
    });

    await Promise.allSettled(tasks);
    ReconnectService.deps?.broadcastLog("Auto-reconnect selesai.", "success");
  }
}
