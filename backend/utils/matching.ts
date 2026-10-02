/**
 * matching.ts
 * Utility functions for Telegram target matching, keyword detection,
 * text normalization, and ID formatting.
 */

export const fetchWithTimeout = (promise: Promise<any>, ms = 15000) => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("API Timeout (Stuck)")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const normalizeTarget = (value: string) =>
  (value || "").trim().toLowerCase().replace(/^@/, "");

export const normalizeNumericId = (value: string) => {
  const n = normalizeTarget(value);
  if (!/^-?\d+$/.test(n)) return n;
  return n.replace(/^-100/, "").replace(/^-/, "");
};

export const stripUrlsForWordMatching = (text: string): string => {
  return (text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/t\.me\/\S+/gi, " ")
    .replace(/tg:\/\/join\S+/gi, " ");
};

export const normalizeForKeyword = (value: string) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildTelegramMessageLink = (
  targetUsername: string | undefined,
  targetId: string | number | any,
  messageId: number | string
): string => {
  const msgId = Number(messageId) || 0;
  if (msgId <= 0) return "";

  const cleanUsername = String(targetUsername || "").trim().replace(/^@/, "");
  if (cleanUsername && !/^-?\d+$/.test(cleanUsername)) {
    return `https://t.me/${cleanUsername}/${msgId}`;
  }

  const rawId = String(targetId || "").trim();
  const cleanId = rawId.replace(/^-100/, "").replace(/^-/, "");
  if (cleanId && /^\d+$/.test(cleanId)) {
    return `https://t.me/c/${cleanId}/${msgId}`;
  }

  return `https://t.me/${cleanUsername || cleanId || "chat"}/${msgId}`;
};

export const matchesSingleKeyword = (
  rawText: string,
  singleKeyword: string,
): boolean => {
  const k = (singleKeyword || "").toLowerCase().trim();
  if (!k) return false;

  // Guardrail: Single non-alphanumeric symbols (seperti "@", "#", "!", dll) tidak boleh memicu matching
  if (k.length === 1 && !/[a-z0-9]/i.test(k)) return false;
  if (/^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(k)) return false;

  // False positive guard: Jika keyword adalah kata biasa tanpa simbol URL (/ . :),
  // bersihkan URL dari rawText agar query param (misal ?start=123) tidak memicu filter kata terlarang.
  const isUrlKeyword = /[./:]/.test(k);
  const textToMatch = isUrlKeyword ? rawText : stripUrlsForWordMatching(rawText);

  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  try {
    if (new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(textToMatch))
      return true;
  } catch {}

  const nt = normalizeForKeyword(textToMatch);
  const nk = normalizeForKeyword(k);
  if (!nk) return false;
  try {
    const nEscaped = nk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z0-9])${nEscaped}(?![a-z0-9])`).test(nt);
  } catch {}

  return false;
};

export const containsKeyword = (rawText: string, keyword: string): string | false => {
  const parts = (keyword || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (matchesSingleKeyword(rawText, part)) return part;
  }
  return false;
};

export const toIdVariants = (value: unknown): string[] => {
  if (value == null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  const numeric = raw.replace(/^-100/, "").replace(/^-/, "");
  if (!/^\d+$/.test(numeric)) return [raw];
  return Array.from(new Set([raw, numeric, `-${numeric}`, `-100${numeric}`]));
};

export const matchesTarget = (
  target: string,
  message: any,
  sender: any,
  chat: any,
  extraCandidates: string[] = [],
): boolean => {
  if (!target) return false;
  const nt = normalizeTarget(target);
  const nn = normalizeNumericId(target);

  const candidates = [
    sender?.username,
    sender?.id ? String(sender.id) : "",
    chat?.title,
    chat?.username,
    chat?.id ? String(chat.id) : "",
    message?.chat?.username,
    message?.chat?.title,
    message?.chat?.id ? String(message.chat.id) : "",
    message?.peerId?.channelId ? String(message.peerId.channelId) : "",
    message?.peerId?.chatId ? String(message.peerId.chatId) : "",
    message?.fwdFrom?.fromId?.channelId ? String(message.fwdFrom.fromId.channelId) : "",
    message?.fwdFrom?.fromId?.chatId ? String(message.fwdFrom.fromId.chatId) : "",
    message?.fwdFrom?.fromId?.userId ? String(message.fwdFrom.fromId.userId) : "",
    ...extraCandidates,
  ]
    .filter(Boolean)
    .map(normalizeTarget);

  const numericCandidates = candidates.map(normalizeNumericId);

  return (
    candidates.includes(nt) ||
    candidates.some((c) => c.endsWith(nt)) ||
    numericCandidates.includes(nn) ||
    numericCandidates.some((c) => c.endsWith(nn))
  );
};

export const checkConfiguredTarget = (
  settings: { autoDetect: boolean; targetGroups: string[] },
  message: any,
  sender: any,
  chat: any,
  extraCandidates: string[] = [],
): string | null => {
  if (settings.autoDetect) return "auto_detect";
  const activeTargets = (settings.targetGroups || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean);
  if (!activeTargets.length) return "all";

  const candidates = [
    sender?.username,
    sender?.id ? String(sender.id) : "",
    chat?.title,
    chat?.username,
    chat?.id ? String(chat.id) : "",
    message?.chat?.username,
    message?.chat?.title,
    message?.chat?.id ? String(message.chat.id) : "",
    message?.peerId?.channelId ? String(message.peerId.channelId) : "",
    message?.peerId?.chatId ? String(message.peerId.chatId) : "",
    message?.fwdFrom?.fromId?.channelId ? String(message.fwdFrom.fromId.channelId) : "",
    message?.fwdFrom?.fromId?.chatId ? String(message.fwdFrom.fromId.chatId) : "",
    message?.fwdFrom?.fromId?.userId ? String(message.fwdFrom.fromId.userId) : "",
    ...extraCandidates,
  ]
    .filter(Boolean)
    .map(normalizeTarget);

  const numericCandidates = candidates.map(normalizeNumericId);

  for (const target of activeTargets) {
    const nt = normalizeTarget(target);
    const nn = normalizeNumericId(target);
    if (
      candidates.includes(nt) ||
      candidates.some((c) => c.endsWith(nt)) ||
      numericCandidates.includes(nn) ||
      numericCandidates.some((c) => c.endsWith(nn))
    ) {
      return target;
    }
  }

  return null;
};

export const formatTargetId = (targetId: any) => {
  if (!targetId) return "";

  let idStr = "";
  let isChannel = false;
  let isChat = false;

  if (typeof targetId === "object") {
    const className = targetId.className;
    if (className === "PeerChannel" || className === "Channel") {
      isChannel = true;
    } else if (className === "PeerChat" || className === "Chat") {
      isChat = true;
    }

    const channelId = targetId.channelId ? String(targetId.channelId) : "";
    const chatId = targetId.chatId ? String(targetId.chatId) : "";
    const userId = targetId.userId ? String(targetId.userId) : "";
    const entityId = targetId.id ? String(targetId.id) : "";

    idStr = channelId || chatId || userId || entityId;
  } else {
    idStr = String(targetId);
  }

  idStr = idStr.trim();

  if (idStr.startsWith("-")) return idStr;

  if (/^\d+$/.test(idStr)) {
    if (isChannel) {
      return `-100${idStr}`;
    } else if (isChat) {
      return `-${idStr}`;
    } else {
      return `-100${idStr}`;
    }
  }

  return idStr;
};

export const preview = (text: string, max = 120) =>
  text && text.length > max ? `${text.slice(0, max)}…` : text || "";
