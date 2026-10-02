/**
 * MessageQueue.ts
 * Mengelola antrean pengiriman pesan Telegram per akun, rate-limiting per grup,
 * adaptive delay, serta penanganan error FLOOD_WAIT dan mute grup.
 */

import path from "path";
import { TelegramClient } from "telegram";
import { MEDIA_DIR } from "../config/storage.js";
import { SettingsRepository } from "../repositories/SettingsRepository.js";
import { StatsRepository } from "../repositories/StatsRepository.js";
import {
  fetchWithTimeout,
  buildTelegramMessageLink,
  formatTargetId,
  preview,
} from "../utils/matching.js";
import { SocketService } from "./SocketService.js";
import { describeSendError } from "./TelegramErrors.js";

export interface QueueTask {
  targetId: any;
  replyTo: number;
  message: string;
  mediaPaths?: string[];
  groupLabel: string;
  keyword: string;
  configuredTargetId?: string;
  targetUsername?: string;
}

export interface MessageQueueDependencies {
  getClient: (accountId: string) => TelegramClient | undefined;
  broadcastLog: (msg: string, type?: "info" | "success" | "error" | "bot" | "warning" | "ai") => void;
}

export class MessageQueue {
  private static deps: MessageQueueDependencies | null = null;

  public static readonly responseQueueByAccount = new Map<string, QueueTask[]>();
  public static readonly processingQueueAccounts = new Set<string>();
  public static readonly queuedReplySet = new Set<string>();
  public static readonly accountFloodCooldown = new Map<string, number>();
  public static readonly targetMuteCooldown = new Map<string, number>();
  public static readonly lastSendTimePerGroup = new Map<string, number>();
  public static readonly consecutiveSuccessByAccount = new Map<string, number>();

  public static init(deps: MessageQueueDependencies) {
    this.deps = deps;
  }

  public static async processQueue(accountId: string) {
    const queue = this.responseQueueByAccount.get(accountId) || [];
    const client = this.deps?.getClient(accountId);

    if (
      this.processingQueueAccounts.has(accountId) ||
      queue.length === 0 ||
      !client?.connected
    ) {
      return;
    }

    this.processingQueueAccounts.add(accountId);

    try {
      const task = queue.shift();
      if (task) {
        try {
          // Per-group rate limiting: pastikan tidak kirim ke grup sama terlalu cepat (min 2 detik)
          const groupKey = `${accountId}:${formatTargetId(task.targetId)}`;
          const lastGroupSend = this.lastSendTimePerGroup.get(groupKey) || 0;
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
            const sentMsgId = Array.isArray(sentResult)
              ? Number(sentResult[0]?.id || 0)
              : Number(sentResult?.id || 0);
            const directLink = buildTelegramMessageLink(
              task.targetUsername,
              task.targetId,
              sentMsgId,
            );
            this.deps?.broadcastLog(
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
            const directLink = buildTelegramMessageLink(
              task.targetUsername,
              task.targetId,
              sentMsgId,
            );
            this.deps?.broadcastLog(
              `[${accountId}] ✅ ${directLink ? `${directLink} | ` : ""}TERKIRIM ke grup "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}" | balasan="${preview(task.message, 80)}" | replyTo=${task.replyTo}${sentMsgId ? ` | msgId=${sentMsgId}` : ""}`,
              "success",
            );
          }

          this.lastSendTimePerGroup.set(groupKey, Date.now());
          StatsRepository.recordSendResult(
            "success",
            accountId,
            task.configuredTargetId || formatTargetId(task.targetId),
            task.keyword || undefined,
          );

          // Track consecutive success for adaptive delay
          const prevSuccess = this.consecutiveSuccessByAccount.get(accountId) || 0;
          this.consecutiveSuccessByAccount.set(accountId, prevSuccess + 1);

          // Adaptive delay: gunakan antiSpamDelay dari settings (clamp nilai aman: min 500ms, max 5000ms).
          const rawSetting = SettingsRepository.getAccountSettings(accountId).antiSpamDelay;
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

          const floodCooldownUntil = this.accountFloodCooldown.get(accountId) || 0;
          const isInCooldown = Date.now() < floodCooldownUntil;
          const consecutiveOk = this.consecutiveSuccessByAccount.get(accountId) || 0;

          // Adaptive: jika banyak sukses berturut-turut, kurangi delay (min 500ms)
          // Jika dalam cooldown, naikkan delay
          let delay: number;
          if (isInCooldown) {
            delay = Math.min(baseSetting * 2, 4000);
            this.consecutiveSuccessByAccount.set(accountId, 0);
          } else if (consecutiveOk > 10) {
            delay = Math.max(baseSetting * 0.7, 500);
          } else {
            delay = baseSetting;
          }
          await new Promise((r) => setTimeout(r, delay));
        } catch (err: any) {
          const { code, reason, technical } = describeSendError(err);

          if (
            code === "FLOOD_WAIT" ||
            technical.includes("wait of") ||
            code === "SLOWMODE_WAIT"
          ) {
            if (code === "SLOWMODE_WAIT") {
              StatsRepository.recordFunnelEvent("slowmode");
            } else {
              StatsRepository.recordFunnelEvent("flood");
            }
            const waitMatch =
              technical.match(/(\d+)\s+seconds/i) ||
              technical.match(/FLOOD_WAIT_(\d+)/i) ||
              technical.match(/\d+/);
            const rawSecs = parseInt(waitMatch?.[1] || waitMatch?.[0] || "10");
            const secs = Math.min(isNaN(rawSecs) ? 10 : rawSecs, 60);

            this.deps?.broadcastLog(
              `[${accountId}] ⏳ SLOWMODE / FLOOD WAIT (${secs}s) di "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}". ${reason}`,
              "warning",
            );
            SocketService.pushErrorLog({
              accountId,
              stage: "send_message",
              target: `${task.groupLabel} (ID: ${formatTargetId(task.targetId)})`,
              keyword: task.keyword,
              messagePreview:
                task.mediaPaths && task.mediaPaths.length > 0
                  ? `[Media Group] ${task.mediaPaths.map((m) => path.basename(m)).join(", ")}`
                  : preview(task.message),
              errorCode: code,
              reason: `${reason} (Slowmode/cooldown ${secs} detik)`,
              technical,
            });

            const io = SocketService.getIO();
            if (io) {
              io.emit("flood-wait", {
                accountId,
                seconds: secs,
                until: Date.now() + secs * 1000,
              });
            }

            // Set cooldown pada akun agar pengiriman berikutnya berjarak aman
            this.accountFloodCooldown.set(accountId, Date.now() + secs * 1000);
            this.consecutiveSuccessByAccount.set(accountId, 0);
            StatsRepository.recordSendResult(
              "failed",
              accountId,
              task.configuredTargetId || formatTargetId(task.targetId),
              task.keyword || undefined,
            );
            // Wait the EXACT flood wait time (up to 30s cap for queue responsiveness)
            await new Promise((r) => setTimeout(r, Math.min(secs, 30) * 1000));
          } else {
            StatsRepository.recordFunnelEvent("delivery_failed");
            this.deps?.broadcastLog(
              `[${accountId}] ❌ GAGAL kirim ke grup "${task.groupLabel}" (ID: ${formatTargetId(task.targetId)}) | keyword="${task.keyword || "-"}" | balasan="${task.mediaPaths && task.mediaPaths.length > 0 ? `[Media Group] ${task.mediaPaths.map((m) => path.basename(m)).join(", ")}` : preview(task.message, 80)}" | kode=${code} | sebab: ${reason}`,
              "error",
            );
            SocketService.pushErrorLog({
              accountId,
              stage: "send_message",
              target: `${task.groupLabel} (ID: ${formatTargetId(task.targetId)})`,
              keyword: task.keyword,
              messagePreview:
                task.mediaPaths && task.mediaPaths.length > 0
                  ? `[Media Group] ${task.mediaPaths.map((m) => path.basename(m)).join(", ")}`
                  : preview(task.message),
              errorCode: code,
              reason,
              technical,
            });
            if (code === "CHAT_WRITE_FORBIDDEN") {
              const targetKey = `${accountId}:${formatTargetId(task.targetId)}`;
              this.targetMuteCooldown.set(targetKey, Date.now() + 30 * 60 * 1000);
              this.deps?.broadcastLog(
                `[${accountId}] ⚠️ Akun terdeteksi di-MUTE/dilarang menulis di "${task.groupLabel}". Pengiriman ke grup ini di-pause otomatis selama 30 menit untuk mencegah penumpukan error gagal.`,
                "warning",
              );
            }
            StatsRepository.recordSendResult(
              "failed",
              accountId,
              task.configuredTargetId || formatTargetId(task.targetId),
            );
          }
        }
      }
    } finally {
      this.processingQueueAccounts.delete(accountId);
      this.processQueue(accountId);
    }
  }

  public static addToQueue(
    accountId: string,
    targetId: any,
    replyTo: number,
    message?: string,
    mediaPaths?: string[],
    groupLabel: string = "",
    keyword: string = "",
    configuredTargetId: string = "",
    targetUsername: string = "",
  ) {
    const replyKey =
      mediaPaths && mediaPaths.length > 0
        ? `${accountId}:${replyTo}:media:${mediaPaths.join(",")}`
        : `${accountId}:${replyTo}:msg:${message || ""}`;

    if (this.queuedReplySet.has(replyKey)) {
      StatsRepository.recordFunnelEvent("skipped");
      return;
    }

    const targetMuteKey = `${accountId}:${formatTargetId(targetId)}`;
    const muteUntil = this.targetMuteCooldown.get(targetMuteKey) || 0;
    if (Date.now() < muteUntil) {
      // Target grup sedang di-mute untuk akun ini - lewati agar tidak spam gagal
      StatsRepository.recordFunnelEvent("skipped");
      return;
    }

    this.queuedReplySet.add(replyKey);
    if (this.queuedReplySet.size > 2000) this.queuedReplySet.clear();

    if (!this.responseQueueByAccount.has(accountId)) {
      this.responseQueueByAccount.set(accountId, []);
    }
    const queue = this.responseQueueByAccount.get(accountId)!;
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
    this.processQueue(accountId);
  }
}
