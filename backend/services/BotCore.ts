/**
 * BotCore.ts
 * Inti logika pemrosesan pesan masuk Telegram:
 * evaluasi filter kata, validasi target grup, intent AI gatekeeper,
 * resolusi thread diskusi, serta pemilihan template balasan acak.
 */

import path from "path";
import { TelegramClient, Api } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { MEDIA_DIR } from "../config/storage.js";
import {
  SettingsRepository,
  ReplyItem,
} from "../repositories/SettingsRepository.js";
import { StatsRepository } from "../repositories/StatsRepository.js";
import { AiConfigRepository } from "../repositories/AiConfigRepository.js";
import { AIService } from "./AIService.js";
import { BroadcastService } from "./BroadcastService.js";
import { MessageQueue } from "./MessageQueue.js";
import { PollingService } from "./PollingService.js";
import { getKeywordIndex } from "../utils/KeywordIndex.js";
import {
  toIdVariants,
  matchesTarget,
  checkConfiguredTarget,
  formatTargetId,
  matchesSingleKeyword,
} from "../utils/matching.js";

export interface BotCoreDependencies {
  getClient: (accountId: string) => TelegramClient | undefined;
  broadcastLog: (
    msg: string,
    type?: "info" | "success" | "error" | "bot" | "warning" | "ai",
  ) => void;
}

export class BotCore {
  private static deps: BotCoreDependencies | null = null;

  public static readonly linkedChatCache = new Map<
    string,
    { candidates: string[]; expires: number }
  >();
  public static readonly discussionCache = new Map<
    string,
    { data: { discussionMsgId: number; discussionChat: any } | null; expires: number }
  >();
  public static readonly processedMessageKeys = new Set<string>();
  public static readonly repliedThreadKeys = new Set<string>();

  public static init(deps: BotCoreDependencies) {
    this.deps = deps;
  }

  public static async getLinkedChatCandidates(
    accountId: string,
    tgClient: TelegramClient,
    chat: any,
  ): Promise<string[]> {
    if (!chat || (chat.className !== "Channel" && chat.className !== "Chat")) {
      return [];
    }
    const key = `${accountId}:${chat.className}:${String(chat.id || "")}`;
    const cached = this.linkedChatCache.get(key);
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
      this.linkedChatCache.set(key, {
        candidates,
        expires: Date.now() + 10 * 60 * 1000, // 10 menit TTL
      });
      return candidates;
    } catch {
      this.linkedChatCache.set(key, {
        candidates: [],
        expires: Date.now() + 2 * 60 * 1000,
      });
      return [];
    }
  }

  public static matchesConfiguredTarget(
    accountId: string,
    message: any,
    sender: any,
    chat: any,
    extraCandidates: string[] = [],
  ): string | null {
    const settings = SettingsRepository.getAccountSettings(accountId);
    return checkConfiguredTarget(
      settings,
      message,
      sender,
      chat,
      extraCandidates,
    );
  }

  public static async resolveReplyTarget(message: any, chat: any) {
    try {
      const inputChat = await message?.getInputChat?.();
      if (inputChat) return inputChat;
    } catch {}
    if (chat) return chat;
    return message?.peerId;
  }

  public static async getDiscussionMsgId(
    tgClient: TelegramClient,
    channel: any,
    channelMsgId: number,
  ): Promise<{ discussionMsgId: number; discussionChat: any } | null> {
    const key = `${String(channel?.id || "")}:${channelMsgId}`;
    const cached = this.discussionCache.get(key);
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
        this.discussionCache.set(key, {
          data: null,
          expires: Date.now() + 5 * 60 * 1000,
        });
        return null;
      }
      const discussionMsgId = Number(msgs[0]?.id || 0);
      if (!discussionMsgId) {
        this.discussionCache.set(key, {
          data: null,
          expires: Date.now() + 5 * 60 * 1000,
        });
        return null;
      }
      const discussionChat =
        chats.find((c: any) => c.megagroup) ||
        chats.find((c: any) => !c.broadcast) ||
        chats[0] ||
        null;
      const data = { discussionMsgId, discussionChat };
      this.discussionCache.set(key, {
        data,
        expires: Date.now() + 15 * 60 * 1000,
      });
      return data;
    } catch {
      this.discussionCache.set(key, {
        data: null,
        expires: Date.now() + 2 * 60 * 1000,
      });
      return null;
    }
  }

  public static async resolveDiscussionReplyTarget(
    accountId: string,
    tgClient: TelegramClient,
    chat: any,
  ) {
    try {
      const candidates = await this.getLinkedChatCandidates(
        accountId,
        tgClient,
        chat,
      );
      for (const candidate of candidates) {
        try {
          return await tgClient.getEntity(candidate);
        } catch {}
      }
    } catch {}
    return this.resolveReplyTarget(null, chat);
  }

  public static async handleIncomingMessage(
    accountId: string,
    tgClient: TelegramClient,
    message: any,
    source: "event" | "poll",
  ) {
    const settings = SettingsRepository.getAccountSettings(accountId);
    if (!settings.isActive || !message) return;

    const rawText = String(message.message || "").trim();
    if (!rawText || message.out) return;

    // Catat ke corong funnel: bot mendengarkan pesan masuk di grup
    StatsRepository.recordFunnelEvent("heard");

    const msgText = rawText.toLowerCase();

    // ─── TAHAP 0 (FAST IN-MEMORY PRE-CHECK): EVALUASI KEYWORD VIA PRE-INDEXED HASHMAP ───
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
      const linkedCandidates = await this.getLinkedChatCandidates(
        accountId,
        tgClient,
        chat,
      );
      if (
        matchesTarget(
          matchedBroadcastJob.targetGroup,
          message,
          sender,
          chat,
          linkedCandidates,
        )
      ) {
        this.deps?.broadcastLog(
          `[${accountId}] [Broadcaster Trigger] Keyword "${matchedBroadcastKw}" cocok dengan Job "${matchedBroadcastJob.name}". Mengirim balasan...`,
          "bot",
        );

        const item =
          matchedBroadcastJob.items[
            Math.floor(Math.random() * matchedBroadcastJob.items.length)
          ];
        if (item) {
          const mediaList = item.media || [];
          const mediaPaths = mediaList.map((m: string) => path.join(MEDIA_DIR, m));
          const groupLabel =
            chat?.title || chat?.username || matchedBroadcastJob.targetGroup;

          let replyTarget = chat || message?.peerId;
          let replyMsgId = Number(message.id || 0);

          const isFwd = Boolean(
            (message as any)?.fwdFrom || (message as any)?.forward,
          );
          const replyMeta: any = (message as any)?.replyTo;
          const sourceClass = String(chat?.className || "");

          const threadTopId =
            isFwd && sourceClass !== "Channel"
              ? Number(message.id || 0)
              : Number(replyMeta?.replyToTopId || 0) ||
                Number(replyMeta?.replyToMsgId || 0) ||
                Number(message.id || 0);

          if (String(chat?.className || "") === "Channel") {
            const disc = await this.getDiscussionMsgId(
              tgClient,
              chat,
              threadTopId,
            );
            if (disc) {
              replyTarget =
                disc.discussionChat ||
                (await this.resolveDiscussionReplyTarget(
                  accountId,
                  tgClient,
                  chat,
                ));
              replyMsgId = disc.discussionMsgId;
            } else {
              replyTarget = await this.resolveDiscussionReplyTarget(
                accountId,
                tgClient,
                chat,
              );
            }
          } else {
            replyTarget = await this.resolveReplyTarget(message, chat);
          }

          const targetUsername =
            chat?.username ||
            (typeof matchedBroadcastJob.targetGroup === "string" &&
            !matchedBroadcastJob.targetGroup.startsWith("-")
              ? matchedBroadcastJob.targetGroup
              : "");
          if (mediaPaths.length > 0) {
            MessageQueue.addToQueue(
              accountId,
              replyTarget,
              replyMsgId,
              item.text || undefined,
              mediaPaths,
              groupLabel,
              matchedBroadcastKw,
              matchedBroadcastJob.targetGroup,
              targetUsername,
            );
          } else {
            MessageQueue.addToQueue(
              accountId,
              replyTarget,
              replyMsgId,
              item.text,
              undefined,
              groupLabel,
              matchedBroadcastKw,
              matchedBroadcastJob.targetGroup,
              targetUsername,
            );
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
      const startsWithEmoji =
        /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(
          rawText.trim(),
        );
      if (!startsWithEmoji) {
        StatsRepository.recordFunnelEvent("skipped");
        this.deps?.broadcastLog(
          `[${accountId}] ⏭️ SKIP [Emoji Prefix]: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" dilewati — tidak dimulai dengan emoji`,
          "info",
        );
        return;
      }
    }

    if (settings.allowedSendersEnabled) {
      const rawPostAuthor = String((message as any)?.postAuthor || "").trim();
      const fwdPostAuthor = String(
        (message as any)?.fwdFrom?.postAuthor || "",
      ).trim();
      const fwdFromName = String(
        (message as any)?.fwdFrom?.fromName || "",
      ).trim();
      const signatures = [rawPostAuthor, fwdPostAuthor, fwdFromName].filter(
        Boolean,
      );

      const signatureBlocklist = [
        "jgn reply",
        "jangan reply",
        "dont reply",
        "don't reply",
        "pembersihan",
        "cleanup",
        "‼️",
      ];
      const hasBlockedSignature = signatures.some((sig) => {
        const cleanSig = sig.toLowerCase();
        return signatureBlocklist.some((blocked) => cleanSig.includes(blocked));
      });

      if (hasBlockedSignature) {
        StatsRepository.recordFunnelEvent("blocked", 1, "blocked_signature");
        this.deps?.broadcastLog(
          `[${accountId}] 🛑 BLOCKED: Pesan di "${chat?.title || "grup"}" diblokir karena signature mengandung kata jebakan: "${signatures.join(", ")}"`,
          "warning",
        );
        return;
      }

      const senderUsername = String(sender?.username || "").trim();
      const senderTitle = String(sender?.title || "").trim();
      const savedFromPeer = String(
        (message as any)?.fwdFrom?.savedFromPeer || "",
      ).trim();
      const fwdChannelId = String(
        (message as any)?.fwdFrom?.fromId?.channelId || "",
      ).trim();
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
          this.deps?.broadcastLog(
            `[${accountId}] ⚠️ SKIP: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" dilewati (Allowed Senders: ${allowedList.join(", ")}). [sender: "${senderTitle || senderUsername || "-"}", fwdCh: "${fwdChannelId || "-"}", chat: "${chatTitle || "-"}", sig: "${signatures.join(",") || "-"}"]`,
            "info",
          );
          return;
        }
      }
    }

    // ─── TAHAP 2: FILTER BLOCKED WORDS ───
    if (
      settings.filterWordsEnabled &&
      settings.filterWords &&
      settings.filterWords.length > 0
    ) {
      let detectedBlockedWord = "";
      const isBlocked = settings.filterWords.some((word) => {
        const cleanW = String(word || "").trim();
        if (!cleanW || (cleanW.length === 1 && !/[a-z0-9]/i.test(cleanW)))
          return false;
        if (cleanW === "@" || /^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(cleanW))
          return false;
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
        this.deps?.broadcastLog(
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
          this.deps?.broadcastLog(
            `[AI Intent] [Akun: ${infoAkun} | Model: ${infoModel}] SKIP: Bukan target. Kwd: "${detectedKeyword}" | Alasan: ${aiDecision.reason}`,
            "ai",
          );
          return;
        } else {
          this.deps?.broadcastLog(
            `[AI Intent] [Akun: ${infoAkun} | Model: ${infoModel}] PROMOSI: Niat valid. Kwd: "${detectedKeyword}" | Alasan: ${aiDecision.reason}`,
            "ai",
          );
        }
      } catch (aiErr: any) {
        if (aiErr.message?.includes("429")) {
          this.deps?.broadcastLog(
            `[AI Intent] Error Fatal (Semua Limit API Habis / 429).`,
            "ai",
          );
        } else {
          this.deps?.broadcastLog(
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
    const selectedReply =
      matchReplies[Math.floor(Math.random() * matchReplies.length)];
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
      this.deps?.broadcastLog(
        `[${accountId}] ⏭️ SKIP [Bukan Grup]: Pesan keyword "${detectedKeyword}" berasal dari chat privat/bukan grup`,
        "info",
      );
      return;
    }

    const replyMeta: any = (message as any)?.replyTo;
    const isFwd = Boolean(
      (message as any)?.fwdFrom || (message as any)?.forward,
    );
    const sourceClass = String(chat?.className || "");
    const fwdChannelPostIdEarly = Number(
      (message as any)?.fwdFrom?.channelPost || 0,
    );
    const isBroadcastChannel = Boolean((chat as any)?.broadcast);
    const isChannelPeer = Boolean(peer?.channelId);

    if (!isBroadcastChannel && !isChannelPeer) {
      if (sourceClass !== "Channel" && !fwdChannelPostIdEarly && !isFwd) {
        StatsRepository.recordFunnelEvent("skipped");
        this.deps?.broadcastLog(
          `[${accountId}] ⏭️ SKIP [Source Filter]: Pesan keyword "${detectedKeyword}" di "${chat?.title || "grup"}" — bukan dari channel/forward (class=${sourceClass}, broadcast=${isBroadcastChannel}, channelPeer=${isChannelPeer})`,
          "info",
        );
        return;
      }
    }

    const isChannelForward = Boolean((message as any)?.fwdFrom?.channelPost);
    if (
      sender &&
      sender.className === "User" &&
      !sender.bot &&
      !isChannelForward
    ) {
      StatsRepository.recordFunnelEvent("skipped");
      this.deps?.broadcastLog(
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

    if (this.processedMessageKeys.has(dedupeKey)) {
      StatsRepository.recordFunnelEvent("skipped");
      return;
    }
    this.processedMessageKeys.add(dedupeKey);
    if (this.processedMessageKeys.size > 5000) this.processedMessageKeys.clear();

    const linkedCandidates = await this.getLinkedChatCandidates(
      accountId,
      tgClient,
      chat,
    );
    const matchedTarget = this.matchesConfiguredTarget(
      accountId,
      message,
      sender,
      chat,
      linkedCandidates,
    );
    if (!matchedTarget) {
      StatsRepository.recordFunnelEvent("skipped");
      const activeTargets = settings.targetGroups.filter(Boolean);
      const resolvedTargetId = formatTargetId(peer);
      this.deps?.broadcastLog(
        `[${accountId}] ⚠️ SKIP: Grup "${chat?.title || chat?.username || "unknown"}" (ID: ${resolvedTargetId}) tidak cocok dengan Target Groups yang diatur: [${activeTargets.join(", ")}].`,
        "info",
      );
      return;
    }

    const threadKey = `${accountId}:${canonicalPeerId}:${canonicalMsgId}:${detectedKeyword || "custom"}`;
    if (this.repliedThreadKeys.has(threadKey)) {
      StatsRepository.recordFunnelEvent("skipped");
      this.deps?.broadcastLog(
        `[${accountId}] ⏭️ SKIP [Duplikat Thread]: Thread ${threadKey} sudah pernah dibalas sebelumnya`,
        "info",
      );
      return;
    }

    this.repliedThreadKeys.add(threadKey);
    if (this.repliedThreadKeys.size > 10000) this.repliedThreadKeys.clear();

    this.deps?.broadcastLog(
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
          } catch {}
        }
      }

      let replyTarget: any;
      let replyMsgId = threadTopId;

      if (String(effectiveChat?.className || "") === "Channel") {
        const disc = await this.getDiscussionMsgId(
          tgClient,
          effectiveChat,
          threadTopId,
        );
        if (disc) {
          replyTarget =
            disc.discussionChat ||
            (await this.resolveDiscussionReplyTarget(
              accountId,
              tgClient,
              effectiveChat,
            ));
          replyMsgId = disc.discussionMsgId;
        } else {
          replyTarget = await this.resolveDiscussionReplyTarget(
            accountId,
            tgClient,
            effectiveChat,
          );
        }
      } else {
        replyTarget = await this.resolveReplyTarget(message, chat);
      }

      const groupLabel =
        chat?.title || chat?.username || formatTargetId(replyTarget);
      const targetUsername =
        chat?.username ||
        (typeof matchedTarget === "string" && !matchedTarget.startsWith("-")
          ? matchedTarget
          : "");

      // Kirim 1 balasan terpilih ke antrean
      const mediaList = selectedReply.media || [];
      if (mediaList.length > 0) {
        const mediaPaths = mediaList.map((m: string) => path.join(MEDIA_DIR, m));
        MessageQueue.addToQueue(
          accountId,
          replyTarget,
          replyMsgId,
          selectedReply.text || undefined,
          mediaPaths,
          groupLabel,
          detectedKeyword,
          matchedTarget,
          targetUsername,
        );
      } else {
        MessageQueue.addToQueue(
          accountId,
          replyTarget,
          replyMsgId,
          selectedReply.text,
          undefined,
          groupLabel,
          detectedKeyword,
          matchedTarget,
          targetUsername,
        );
      }
    } catch (err: any) {
      this.deps?.broadcastLog(
        `[${accountId}] Error final execution: ${err.message}`,
        "error",
      );
    }
  }

  public static setupBotCore(accountId: string, tgClient: TelegramClient) {
    PollingService.startPollingFallback(accountId, tgClient);

    tgClient.addEventHandler(async (event) => {
      PollingService.markEventReceived(accountId);
      await BotCore.handleIncomingMessage(
        accountId,
        tgClient,
        event.message,
        "event",
      );
    }, new NewMessage({}));

    // Start Auto Broadcaster jobs for this account
    const settings = SettingsRepository.getAccountSettings(accountId);
    if (this.deps) {
      BroadcastService.restartAll(
        accountId,
        settings.broadcastJobs || [],
        () => this.deps!.getClient(accountId),
        this.deps.broadcastLog,
      );
    }
  }

  public static clearAll() {
    this.linkedChatCache.clear();
    this.discussionCache.clear();
    this.processedMessageKeys.clear();
    this.repliedThreadKeys.clear();
  }
}
