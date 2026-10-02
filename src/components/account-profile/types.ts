/* ================================================================
   ACCOUNT PROFILE - TYPES, CONSTANTS, & HELPERS
   ================================================================ */

export interface ReplyItem {
  text: string;
  media?: string[];
}

export interface ResponseRule {
  id: string;
  keywords: string[]; // all treated as the same trigger (synonyms / typo variants)
  replies: ReplyItem[];
}

export interface BotSettings {
  isActive: boolean;
  autoDetect: boolean;
  targetGroups: string[];
  responses: ResponseRule[];
  antiSpamDelay: number;
  requireEmojiPrefix: boolean;
  filterWords: string[];
  filterWordsEnabled: boolean;
  allowedSenders: string[];
  allowedSendersEnabled: boolean;
  aiPrompt?: string;
  broadcastJobs?: BroadcastJob[];
  broadcastFilterWords?: string[];
  broadcastFilterWordsEnabled?: boolean;
}

export interface BroadcastItem {
  text: string;
  media?: string[];
}

export interface BroadcastJob {
  id: string;
  name: string;
  targetGroup: string;
  items: BroadcastItem[];
  intervalMin: number;
  intervalMax: number;
  isActive: boolean;
  keywords?: string[];
}

export interface ResolvedTarget {
  id: string;
  rawId: string;
  title: string;
  type: string;
  username: string | null;
  membersCount: number | null;
}

export interface AccountInfo {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
}

export interface AccountStatus {
  accountId: string;
  connected: boolean;
  hasSession: boolean;
}

export interface HealthInfo {
  status: string;
  pingMs?: number;
  anomalies?: string[];
  groupStatsToday?: Record<string, { total: number; byAccount: Record<string, number> }>;
  keywordStats?: Record<string, { total: number; byAccount: Record<string, number>; byGroup: Record<string, number> }>;
  [key: string]: any;
}

/* ================================================================
   CONSTANTS & DEFAULTS
   ================================================================ */

export const DEFAULT_AI_PROMPT = `Kamu adalah classifier intent untuk bot auto-reply jual-beli di grup Telegram Indonesia.
Keyword target: "@keyword"
Pesan dari user di grup: "@usermessage"

TUGAS: Tentukan apakah bot harus REPLY (PROMOSI) atau DIAM (SKIP).

ATURAN UTAMA: SELALU PILIH PROMOSI. SKIP adalah pengecualian yang SANGAT JARANG.

PROMOSI (WAJIB reply) jika:
- Pesan mengandung keyword "@keyword" dalam konteks APAPUN
- Pengirim mencari, butuh, tanya, mau, order, beli, minta info "@keyword"
- Pesan singkat/emoji + keyword ("🛍️ @keyword", "@keyword dong", "@keyword?", "ada @keyword")
- Bahasa informal, singkatan, typo (maw, bli, req, spill, ada?, ready?, brp?)
- Pengirim menyebut budget/harga/durasi terkait keyword ("netf 1d", "capcut 1m 5k")
- Pesan ambigu APAPUN yang menyebut keyword → PROMOSI
- Pesan request/cari yang melibatkan keyword meski ada kata lain
- Pesan yang menyebut keyword WALAUPUN isinya kompleks atau panjang

SKIP (HANYA jika SEMUA syarat terpenuhi):
- Pengirim JELAS dan EKSPLISIT sedang MENJUAL/MEMPROMOSIKAN jasa/produk MEREKA SENDIRI sebagai competitor (contoh: "hit me as seller", "contact @xxx for netflix", "hmu @xxx")
- ATAU pengirim TEGAS membatalkan ("gajadi", "cancel", "batal")
- ATAU troll/penipuan EKSPLISIT ("prank", "bohong", "scammer")

PENTING:
- Jika RAGU antara PROMOSI atau SKIP → SELALU pilih PROMOSI
- Pesan yang hanya berisi keyword + emoji/angka → PROMOSI
- Jangan pernah SKIP pesan hanya karena singkat, ambigu, atau tidak formal
- Pesan yang menanyakan hal terkait keyword (ready?, ada?, berapa?) → PROMOSI
- HANYA SKIP jika pengirim AKTIF JUALAN produk mereka (bukan sekedar menyebut keyword)
@blockedkeyword`;

export const genId = () => Math.random().toString(36).slice(2, 10);

export const defaultSettings: BotSettings = {
  isActive: false,
  autoDetect: false,
  targetGroups: [],
  responses: [],
  antiSpamDelay: 2000,
  requireEmojiPrefix: false,
  filterWords: [],
  filterWordsEnabled: false,
  allowedSenders: [],
  allowedSendersEnabled: false,
  broadcastJobs: [],
  broadcastFilterWords: [],
  broadcastFilterWordsEnabled: false,
};

/* ================================================================
   MIGRATION HELPERS
   ================================================================ */

export function migrateReplies(rawReplies: any[]): ReplyItem[] {
  return (rawReplies || []).map((rep) => {
    if (typeof rep === "string") {
      return { text: rep, media: [] };
    }
    if (rep && typeof rep === "object") {
      return {
        text: typeof rep.text === "string" ? rep.text : "",
        media: Array.isArray(rep.media) ? rep.media.map(String) : [],
      };
    }
    return { text: "", media: [] };
  });
}

export function migrateResponses(raw: any[]): ResponseRule[] {
  return (raw || []).map((r) => {
    let replies: ReplyItem[] = [];
    if (Array.isArray(r.replies)) {
      replies = migrateReplies(r.replies);
    } else if (typeof r.response === "string") {
      const parts = r.response
        .split("|||")
        .map((s: string) => s.trim())
        .filter(Boolean);
      replies = parts.map((text: string) => ({ text, media: [] }));
    }

    let keywords: string[] = [];
    if (Array.isArray(r.keywords)) {
      keywords = r.keywords;
    } else if (typeof r.keyword === "string") {
      keywords = r.keyword
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean);
    }

    return {
      id: r.id || genId(),
      keywords,
      replies,
    };
  });
}

/* ================================================================
   AI HELPER
   ================================================================ */

export async function callAiSuggest(
  mode: "keyword-synonyms" | "filter-variants",
  input: string,
): Promise<string[]> {
  try {
    const backendMode = mode === "keyword-synonyms" ? "keyword" : "blocked";

    const r = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: backendMode, input }),
    });

    const data = await r.json();

    if (!r.ok) {
      alert("AI Error: " + (data.error || "Gagal menghubungi AI"));
      return [];
    }

    return Array.isArray(data.result) ? data.result : [];
  } catch (err) {
    console.error("AI Fetch Error:", err);
    alert("Gagal koneksi ke server Backend.");
    return [];
  }
}
