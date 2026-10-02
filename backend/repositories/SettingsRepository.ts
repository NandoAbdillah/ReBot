// backend/repositories/SettingsRepository.ts
import fs from "fs";
import { DB_PATHS } from "../config/storage.js";

export interface ReplyItem {
  text: string;
  media?: string[];
}

export interface ResponseRule {
  id: string;
  keywords: string[];
  replies: ReplyItem[];
}

export interface BroadcastItem {
  text: string;
  media?: string[]; // filenames inside /media/
}

export interface BroadcastJob {
  id: string;
  name: string;         // user-friendly label, e.g. "Promo Bundle LPM"
  targetGroup: string;  // @username or -100xxxxxxx
  items: BroadcastItem[]; // pool of content — one picked at random each tick
  intervalMin: number;  // seconds (minimum delay)
  intervalMax: number;  // seconds (maximum delay) — if same as min: fixed interval
  isActive: boolean;    // per-job on/off switch
  keywords?: string[];   // keywords that trigger this job as reply (can be empty)
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
  aiPrompt?: string; // Prompt AI kustom per-akun (opsional, override prompt global)
  broadcastJobs?: BroadcastJob[]; // Auto Broadcaster jobs (no keyword trigger)
  broadcastFilterWords?: string[];
  broadcastFilterWordsEnabled?: boolean;
}

export const defaultSettings: BotSettings = {
  isActive: false,
  autoDetect: false,
  targetGroups: [],
  responses: [],
  antiSpamDelay: 800,
  requireEmojiPrefix: false,
  filterWords: [],
  filterWordsEnabled: false,
  allowedSenders: [],
  allowedSendersEnabled: false,
  broadcastJobs: [],
  broadcastFilterWords: [],
  broadcastFilterWordsEnabled: false,
};

const cleanFilterWords = (words: any[]): string[] => {
  if (!Array.isArray(words)) return [];
  return words
    .map(String)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => {
      if (!w) return false;
      // Drop single character punctuation/symbols like "@", "#", "!", ",", ".", etc.
      if (w.length === 1 && !/[a-z0-9]/i.test(w)) return false;
      // Specifically drop standalone "@" or pure punctuation
      if (/^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(w)) return false;
      return true;
    });
};

const normalizeDelay = (delay: any): number => {
  let num = Number(delay);
  if (!Number.isFinite(num) || num <= 0) return defaultSettings.antiSpamDelay;
  // If user entered 1..9 (likely thinking in seconds, e.g. 2 -> 2000ms)
  if (num > 0 && num < 10) {
    num = num * 1000;
  }
  // Clamp between safe limits (500ms - 5000ms)
  return Math.min(Math.max(num, 500), 5000);
};

export const sanitizeSettings = (input: Partial<BotSettings> | null | undefined): BotSettings => {
  const merged: BotSettings = {
    ...defaultSettings,
    ...(input || {}),
    responses: Array.isArray(input?.responses) ? input!.responses.map((rule: any) => {
      // Migrate keywords
      let keywords: string[] = [];
      if (Array.isArray(rule.keywords)) {
        keywords = rule.keywords.map(String);
      } else if (typeof rule.keyword === "string") {
        keywords = rule.keyword.split(",").map((k: string) => k.trim()).filter(Boolean);
      }

      // Migrate replies
      let replies: ReplyItem[] = [];
      if (Array.isArray(rule.replies)) {
        replies = rule.replies.map((rep: any) => {
          if (typeof rep === "string") {
            return { text: rep, media: [] };
          }
          if (rep && typeof rep === "object") {
            return {
              text: typeof rep.text === "string" ? rep.text : "",
              media: Array.isArray(rep.media) ? rep.media.map(String) : []
            };
          }
          return { text: "", media: [] };
        });
      } else if (typeof rule.response === "string") {
        const parts = rule.response.split("|||").map((s: string) => s.trim()).filter(Boolean);
        replies = parts.map((text: string) => ({ text, media: [] }));
      }

      return {
        id: String(rule.id || Math.random().toString(36).slice(2, 10)),
        keywords,
        replies
      };
    }) : defaultSettings.responses,
    targetGroups: Array.isArray(input?.targetGroups) ? input!.targetGroups : defaultSettings.targetGroups,
    filterWords: cleanFilterWords(input?.filterWords || []),
    allowedSenders: Array.isArray(input?.allowedSenders) ? input!.allowedSenders.map(String).map((s) => s.trim().toLowerCase()).filter(Boolean) : [],
    broadcastJobs: Array.isArray(input?.broadcastJobs)
      ? input!.broadcastJobs.map((job: any) => ({
          id: String(job.id || Math.random().toString(36).slice(2, 10)),
          name: String(job.name || "Broadcast Job"),
          targetGroup: String(job.targetGroup || ""),
          items: Array.isArray(job.items)
            ? job.items.map((item: any) => ({
                text: typeof item.text === "string" ? item.text : "",
                media: Array.isArray(item.media) ? item.media.map(String) : [],
              }))
            : [],
          intervalMin: Number.isFinite(Number(job.intervalMin)) ? Number(job.intervalMin) : 45,
          intervalMax: Number.isFinite(Number(job.intervalMax)) ? Number(job.intervalMax) : 90,
          isActive: Boolean(job.isActive),
          keywords: Array.isArray(job.keywords) ? job.keywords.map(String).map((k) => k.toLowerCase().trim()).filter(Boolean) : [],
        }))
      : [],
    broadcastFilterWords: cleanFilterWords(input?.broadcastFilterWords || []),
    broadcastFilterWordsEnabled: Boolean(input?.broadcastFilterWordsEnabled ?? defaultSettings.broadcastFilterWordsEnabled),
  };
  const cleanedTargets = Array.from(
    new Set((merged.targetGroups || []).map((t) => String(t || "").trim()).filter(Boolean))
  );
  return {
    ...merged,
    targetGroups: cleanedTargets,
    antiSpamDelay: normalizeDelay(merged.antiSpamDelay),
    requireEmojiPrefix: Boolean(merged.requireEmojiPrefix),
    filterWordsEnabled: Boolean(merged.filterWordsEnabled),
    allowedSendersEnabled: Boolean(merged.allowedSendersEnabled),
    broadcastFilterWordsEnabled: Boolean(merged.broadcastFilterWordsEnabled),
    aiPrompt: typeof merged.aiPrompt === "string" ? merged.aiPrompt : undefined,
  };
};

export class SettingsRepository {
  public static accountSettingsMap = new Map<string, BotSettings>();
  private static globalSettings: BotSettings = defaultSettings;
  private static isLoaded = false;

  public static load(): void {
    if (this.isLoaded) return;
    
    if (fs.existsSync(DB_PATHS.SETTINGS)) {
      try {
        this.globalSettings = sanitizeSettings(JSON.parse(fs.readFileSync(DB_PATHS.SETTINGS, "utf8")));
      } catch (e) { console.error("[DB] Failed to load global settings", e); }
    }

    if (fs.existsSync(DB_PATHS.ACCOUNT_SETTINGS)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DB_PATHS.ACCOUNT_SETTINGS, "utf8"));
        if (typeof raw === "object" && !Array.isArray(raw)) {
          let dirty = false;
          for (const [id, s] of Object.entries(raw)) {
            const sanitized = sanitizeSettings(s as any);
            this.accountSettingsMap.set(String(id), sanitized);
            if (JSON.stringify(sanitized) !== JSON.stringify(s)) {
              dirty = true;
            }
          }
          if (dirty) {
            this.saveAccountSettings();
            console.log("[SettingsRepository] Cleaned corrupted filter words/delays from account_settings.json");
          }
        }
      } catch (e) { console.error("[DB] Failed to load account settings", e); }
    }
    this.isLoaded = true;
  }

  public static getGlobalSettings(): BotSettings {
    return this.globalSettings;
  }

  public static setGlobalSettings(settings: Partial<BotSettings>): void {
    this.globalSettings = sanitizeSettings({ ...this.globalSettings, ...settings });
    fs.writeFileSync(DB_PATHS.SETTINGS, JSON.stringify(this.globalSettings, null, 2));
  }

  public static getAccountSettings(accountId: string): BotSettings {
    return this.accountSettingsMap.get(accountId) || { ...defaultSettings };
  }

  public static setAccountSettings(accountId: string, settings: Partial<BotSettings>) {
    const current = this.getAccountSettings(accountId);
    const updated = sanitizeSettings({ ...current, ...settings });
    const changed = JSON.stringify(current) !== JSON.stringify(updated);
    
    if (changed) {
      this.accountSettingsMap.set(accountId, updated);
      this.saveAccountSettings();
    }
    return { settings: updated, changed };
  }

  public static removeAccountSettings(accountId: string): void {
    if (this.accountSettingsMap.has(accountId)) {
      this.accountSettingsMap.delete(accountId);
      this.saveAccountSettings();
    }
  }

  public static saveAccountSettings(): void {
    const obj: Record<string, BotSettings> = {};
    for (const [id, s] of this.accountSettingsMap) obj[id] = s;
    fs.writeFileSync(DB_PATHS.ACCOUNT_SETTINGS, JSON.stringify(obj, null, 2));
  }

  public static reload(): void {
    this.isLoaded = false;
    this.accountSettingsMap.clear();
    this.load();
  }
}