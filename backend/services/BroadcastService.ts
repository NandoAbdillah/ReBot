// backend/services/BroadcastService.ts
import path from "path";
import fs from "fs";
import { TelegramClient, Api } from "telegram";
import { MEDIA_DIR } from "../config/storage.js";
import { BroadcastJob, BroadcastItem, SettingsRepository } from "../repositories/SettingsRepository.js";
import { StatsRepository } from "../repositories/StatsRepository.js";
import { buildTelegramMessageLink } from "../utils/matching.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimerHandle {
  timer: NodeJS.Timeout;
}

// ─── BroadcastService ─────────────────────────────────────────────────────────

/**
 * Manages auto-broadcast scheduled jobs per account.
 *
 * Architecture:
 *   timers: Map<accountId, Map<jobId, TimerHandle>>
 *
 * Each job uses recursive setTimeout (not setInterval) so that every tick
 * calculates a fresh random delay between intervalMin and intervalMax seconds.
 * This makes the bot appear significantly less robotic.
 */
export class BroadcastService {
  // timers.get(accountId)?.get(jobId) → active timer handle
  private static timers = new Map<string, Map<string, TimerHandle>>();

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start a single broadcast job for an account.
   * If a timer already exists for this job, it is stopped first.
   */
  public static startJob(
    accountId: string,
    job: BroadcastJob,
    getClient: () => TelegramClient | undefined,
    broadcastLog: (msg: string, type: string) => void,
  ): void {
    if (!job.isActive || !job.targetGroup || job.items.length === 0) return;

    this.stopJob(accountId, job.id);

    if (!this.timers.has(accountId)) {
      this.timers.set(accountId, new Map());
    }

    const scheduleNext = () => {
      const delaySec =
        job.intervalMin === job.intervalMax
          ? job.intervalMin
          : job.intervalMin + Math.random() * (job.intervalMax - job.intervalMin);

      const delayMs = Math.round(delaySec * 1000);

      const timer = setTimeout(async () => {
        try {
          const client = getClient();
          if (!client || !client.connected) {
            // Client offline – reschedule and wait
            scheduleNext();
            return;
          }

          // Check if broadcast blocked words are active and present in the group
          const settings = SettingsRepository.getAccountSettings(accountId);
          if (
            settings.broadcastFilterWordsEnabled &&
            settings.broadcastFilterWords &&
            settings.broadcastFilterWords.length > 0
          ) {
            try {
              const entity = await this.resolveEntitySafe(client, job.targetGroup);
              if (entity) {
                // Fetch last 5 messages to check for warning keywords or spam/ban warnings
                const messages = await client.getMessages(entity, { limit: 5 });
                let containsBlockedWord = false;
                let blockedWordFound = "";

                for (const msg of messages) {
                  const text = String(msg.message || "").toLowerCase();
                  for (const word of settings.broadcastFilterWords) {
                    const cleanWord = word.toLowerCase().trim();
                    if (cleanWord && text.includes(cleanWord)) {
                      containsBlockedWord = true;
                      blockedWordFound = word;
                      break;
                    }
                  }
                  if (containsBlockedWord) break;
                }

                if (containsBlockedWord) {
                  broadcastLog(
                    `[${accountId}] [Broadcaster] 🛑 SKIP: Melewatkan pengiriman untuk "${job.name}" karena terdeteksi kata terlarang broadcast "${blockedWordFound}" di grup baru-baru ini.`,
                    "warning"
                  );
                  // Reschedule for next tick and skip sending
                  scheduleNext();
                  return;
                }
              }
            } catch (historyErr: any) {
              console.error("Gagal memeriksa riwayat pesan grup untuk broadcast blocked words:", historyErr);
            }
          }

          const item = this.pickRandom(job.items);
          await this.sendItem(client, job.targetGroup, item, broadcastLog, accountId, job.name);
        } catch (err: any) {
          broadcastLog(
            `[${accountId}] [Broadcaster] Error saat kirim "${job.name}": ${err.message}`,
            "error",
          );
        }

        // Schedule the next tick regardless of success/failure
        scheduleNext();
      }, delayMs);

      const accountTimers = this.timers.get(accountId)!;
      accountTimers.set(job.id, { timer });
    };

    scheduleNext();
    broadcastLog(
      `[${accountId}] [Broadcaster] Job "${job.name}" → target ${job.targetGroup} diaktifkan (jeda ${job.intervalMin}–${job.intervalMax}s)`,
      "info",
    );
  }

  /**
   * Stop a single broadcast job for an account.
   */
  public static stopJob(accountId: string, jobId: string): void {
    const accountTimers = this.timers.get(accountId);
    if (!accountTimers) return;
    const handle = accountTimers.get(jobId);
    if (handle) {
      clearTimeout(handle.timer);
      accountTimers.delete(jobId);
    }
  }

  /**
   * Stop ALL broadcast jobs for an account.
   */
  public static stopAllForAccount(accountId: string): void {
    const accountTimers = this.timers.get(accountId);
    if (!accountTimers) return;
    for (const handle of accountTimers.values()) {
      clearTimeout(handle.timer);
    }
    accountTimers.clear();
  }

  /**
   * Stop all existing jobs for an account, then start every job that is active.
   * Call this on bot connect or whenever settings change.
   */
  public static restartAll(
    accountId: string,
    jobs: BroadcastJob[],
    getClient: () => TelegramClient | undefined,
    broadcastLog: (msg: string, type: string) => void,
  ): void {
    this.stopAllForAccount(accountId);
    const activeJobs = (jobs || []).filter((j) => j.isActive && j.targetGroup && j.items.length > 0);
    for (const job of activeJobs) {
      this.startJob(accountId, job, getClient, broadcastLog);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private static pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Safe entity resolution with getDialogs sync fallback
   */
  private static async resolveEntitySafe(client: TelegramClient, targetGroup: string): Promise<any> {
    try {
      return await client.getEntity(targetGroup);
    } catch {
      try {
        await client.getDialogs();
        return await client.getEntity(targetGroup);
      } catch (err) {
        console.error(`BroadcastService: Gagal resolve entity "${targetGroup}":`, err);
        return null;
      }
    }
  }

  /**
   * Send one BroadcastItem (text + optional media) to a target group.
   */
  private static async sendItem(
    client: TelegramClient,
    targetGroup: string,
    item: BroadcastItem,
    broadcastLog: (msg: string, type: string) => void,
    accountId: string,
    jobName: string,
  ): Promise<void> {
    try {
      const entity = await this.resolveEntitySafe(client, targetGroup);
      if (!entity) {
        throw new Error(`Target grup "${targetGroup}" tidak dapat ditemukan di Telegram.`);
      }

      const mediaFiles = (item.media || []).filter(Boolean);
      let sentResult: any;

      if (mediaFiles.length > 0) {
        // Build file objects for sendFile / sendMultiMedia
        const filePaths = mediaFiles.map((m) => path.join(MEDIA_DIR, m));
        const existingFiles = filePaths.filter((fp) => fs.existsSync(fp));

        if (existingFiles.length === 0) {
          // No valid media found — send text only if available
          if (item.text) {
            sentResult = await client.sendMessage(entity, { message: item.text });
          } else {
            return;
          }
        } else if (existingFiles.length === 1) {
          // Single file → sendFile
          sentResult = await (client as any).sendFile(entity, {
            file: existingFiles[0],
            caption: item.text || undefined,
          });
        } else {
          // Multiple files → sendFile with album
          sentResult = await (client as any).sendFile(entity, {
            file: existingFiles,
            caption: item.text || undefined,
          });
        }
      } else if (item.text) {
        // Text only
        sentResult = await client.sendMessage(entity, { message: item.text });
      }

      const sentMsgId = Array.isArray(sentResult) ? Number(sentResult[0]?.id || 0) : Number(sentResult?.id || 0);
      const targetUsername = (entity as any)?.username || (typeof targetGroup === "string" && !targetGroup.startsWith("-") ? targetGroup : "");
      const directLink = buildTelegramMessageLink(targetUsername, (entity as any)?.id || targetGroup, sentMsgId);

      const preview = item.text ? item.text.slice(0, 60) : `[${mediaFiles.length} media]`;
      broadcastLog(
        `[${accountId}] [Broadcaster] ✅ "${jobName}" → ${directLink ? `${directLink} | ` : ""}${targetGroup}: "${preview}"${sentMsgId ? ` | msgId=${sentMsgId}` : ""}`,
        "bot",
      );

      // Catat statistik pesan broadcast berhasil dikirim
      StatsRepository.recordBroadcastSuccess(accountId, targetGroup);
    } catch (err: any) {
      const errMsg = err?.message || String(err || "Unknown error");
      broadcastLog(
        `[${accountId}] [Broadcaster] ❌ Gagal kirim job "${jobName}" ke ${targetGroup}: ${errMsg}`,
        "error",
      );
    }
  }
}
