/**
 * PollingService.ts
 * Fallback polling watchdog untuk memastikan pesan tetap terbaca
 * meskipun koneksi event-stream Telegram mengalami jeda atau socket drop.
 */

import { TelegramClient, Api } from "telegram";
import { SettingsRepository } from "../repositories/SettingsRepository.js";
import { normalizeTarget, fetchWithTimeout } from "../utils/matching.js";
import { SocketService } from "./SocketService.js";

export type MessageHandler = (
  accountId: string,
  tgClient: TelegramClient,
  message: any,
  source: "event" | "poll",
) => Promise<void>;

export interface PollingServiceDependencies {
  getClient: (accountId: string) => TelegramClient | undefined;
  getAllLiveClients: () => Map<string, TelegramClient>;
  broadcastLog: (msg: string, type?: "info" | "success" | "error" | "bot" | "warning" | "ai") => void;
  onIncomingMessage: MessageHandler;
}

export class PollingService {
  private static deps: PollingServiceDependencies | null = null;

  public static readonly pollCursorByTarget = new Map<string, number>();
  public static readonly pollingTimerByAccount = new Map<string, NodeJS.Timeout>();
  public static readonly pollingAccounts = new Set<string>();
  public static readonly lastEventTimeByAccount = new Map<string, number>();

  public static init(deps: PollingServiceDependencies) {
    PollingService.deps = deps;
  }

  public static getLiveAccountId(tgClient: TelegramClient, fallbackId: string): string {
    if (!PollingService.deps) return fallbackId;
    for (const [id, client] of PollingService.deps.getAllLiveClients().entries()) {
      if (client === tgClient) return id;
    }
    return fallbackId;
  }

  public static markEventReceived(accountId: string) {
    PollingService.lastEventTimeByAccount.set(accountId, Date.now());
  }

  public static startPollingFallback(accountId: string, tgClient: TelegramClient) {
    if (PollingService.pollingTimerByAccount.has(accountId)) return;

    const timer = setInterval(async () => {
      if (!PollingService.deps) return;
      const currentId = PollingService.getLiveAccountId(tgClient, accountId);
      const client = PollingService.deps.getClient(currentId);
      const settings = SettingsRepository.getAccountSettings(currentId);

      if (client && !client.connected && settings.isActive) {
        PollingService.deps.broadcastLog(
          `[${currentId}] Bot terputus/offline. Mencoba reconnect...`,
          "error",
        );
        const io = SocketService.getIO();
        if (io) {
          io.emit("account-disconnect", {
            accountId: currentId,
            reason: "Bot terputus dari Telegram",
          });
        }
        try {
          await fetchWithTimeout(client.connect(), 30000);
          PollingService.deps.broadcastLog(`[${currentId}] Reconnect otomatis berhasil!`, "success");
        } catch {
          return;
        }
      }

      if (
        PollingService.pollingAccounts.has(currentId) ||
        !client?.connected ||
        !settings.isActive
      ) {
        return;
      }

      const lastEvent = PollingService.lastEventTimeByAccount.get(currentId) || 0;
      // Jika event handler aktif menerima pesan dalam 45 detik terakhir, lewati polling fallback agar hemat koneksi
      if (Date.now() - lastEvent < 45000) {
        return;
      }
      PollingService.pollingAccounts.add(currentId);

      try {
        const targets = settings.targetGroups
          .map((t) => String(t || "").trim())
          .filter(Boolean);

        for (const target of targets) {
          try {
            let entity: any;
            try {
              entity = await tgClient.getEntity(target);
            } catch {
              PollingService.deps.broadcastLog(
                `[${accountId}] 🔍 Cache target "${target}" tidak ditemukan. Mengambil list dialogs Telegram untuk sinkronisasi cache...`,
                "info",
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
              } catch {}
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
              const hasCursor = PollingService.pollCursorByTarget.has(targetKey);
              const cursor = PollingService.pollCursorByTarget.get(targetKey) || 0;
              let maxSeen = cursor;

              if (!hasCursor) {
                const latestId = sorted.length
                  ? Number(sorted[sorted.length - 1]?.id || 0)
                  : 0;
                PollingService.pollCursorByTarget.set(targetKey, latestId);

                // Proses pesan yang dikirim kurang dari 3 menit lalu (180 detik) meskipun cursor baru diinisialisasi
                const nowSec = Math.floor(Date.now() / 1000);
                for (const msg of sorted) {
                  const msgDate = msg.date || 0;
                  if (nowSec - msgDate < 180) {
                    await PollingService.deps.onIncomingMessage(accountId, tgClient, msg, "poll");
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
                await PollingService.deps.onIncomingMessage(accountId, tgClient, msg, "poll");
              }

              PollingService.pollCursorByTarget.set(targetKey, maxSeen);
            }
          } catch (err: any) {
            PollingService.deps.broadcastLog(
              `[${accountId}] ❌ GAGAL memproses target "${target}" dalam polling fallback. Pastikan bot bergabung di grup/channel tersebut dan pemicu aktif. Detail: ${err.message}`,
              "error",
            );
          }
        }
      } finally {
        PollingService.pollingAccounts.delete(accountId);
      }
    }, 20000);

    PollingService.pollingTimerByAccount.set(accountId, timer);
  }

  public static stopPolling(accountId: string) {
    const timer = PollingService.pollingTimerByAccount.get(accountId);
    if (timer) {
      clearInterval(timer);
      PollingService.pollingTimerByAccount.delete(accountId);
    }
  }

  public static clearAll() {
    for (const [, timer] of PollingService.pollingTimerByAccount.entries()) {
      clearInterval(timer);
    }
    PollingService.pollingTimerByAccount.clear();
    PollingService.pollingAccounts.clear();
    PollingService.pollCursorByTarget.clear();
    PollingService.lastEventTimeByAccount.clear();
  }
}
