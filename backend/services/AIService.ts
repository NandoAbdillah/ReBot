// backend/services/AIService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Logger } from "../utils/Logger.js";
import { broadcastLog } from "../../server.js";
import { AiConfigRepository } from "../repositories/AiConfigRepository.js";

const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemma-4-26b",
  "gemma-4-31b",
];

// 2. CACHE MEMORI LOKAL
const intentCache = new Map<
  string,
  { intent: "PROMOSI" | "SKIP"; reason: string }
>();

export class AIService {
  private static modelCooldowns = new Map<string, number>();
  private static unsupportedModels = new Set<string>();

  private static parseJsonResponse(text: string): any {
    const cleanText = text.trim();
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      // Clean up markdown block if present, e.g. ```json ... ``` or ``` ... ```
      const cleaned = cleanText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      try {
        return JSON.parse(cleaned);
      } catch (innerErr) {
        // Fallback regex extraction jika parsing JSON gagal
        const intentMatch = cleaned.match(/"intent"\s*:\s*"(PROMOSI|SKIP)"/i);
        const reasonMatch = cleaned.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
        
        if (intentMatch) {
          return {
            intent: intentMatch[1].toUpperCase(),
            reason: reasonMatch ? reasonMatch[1] : "Extracted via regex fallback."
          };
        }
        throw innerErr;
      }
    }
  }

  private static async executeWithFallback(
    prompt: string,
    apiKeys: string[],
    config: any,
  ): Promise<{ text: string; keyName: string; modelName: string }> {
    if (!apiKeys || apiKeys.length === 0) throw new Error("API Keys kosong.");

    let apiKeysToUse = [...apiKeys];
    let aiConfig = AiConfigRepository.getConfig();

    if (aiConfig.smartKeyEnabled) {
      const today = new Date().toISOString().slice(0, 10);
      const dayStat = aiConfig.dailyStats?.[today] || { byKey: {} };
      const limit = aiConfig.smartKeyLimit ?? 50;

      // Helper to parse key details
      const parsedKeys = apiKeysToUse.map((rawKey, index) => {
        const parts = rawKey.split("|");
        const key = parts.length > 1 ? parts[1] : parts[0];
        const name = parts.length > 1 ? parts[0] : `Key-${index + 1}`;
        const isActive = parts.length > 2 ? parts[2] === "true" : true;
        const requestsToday = dayStat.byKey?.[name] || 0;
        return { rawKey, name, key, isActive, requestsToday, index };
      });

      const activeKeys = parsedKeys.filter(k => k.isActive);
      const inactiveKeys = parsedKeys.filter(k => !k.isActive);

      // Check if any active key is under the limit
      const activeUnderLimit = activeKeys.filter(k => k.requestsToday < limit);

      if (activeUnderLimit.length > 0) {
        // Sort active keys under limit by requestsToday ascending for equal request distribution
        activeUnderLimit.sort((a, b) => a.requestsToday - b.requestsToday);
        
        // Sort active keys over limit by requestsToday ascending
        const activeOverLimit = activeKeys.filter(k => k.requestsToday >= limit);
        activeOverLimit.sort((a, b) => a.requestsToday - b.requestsToday);

        // Put active under limit first, then active over limit, then inactive
        const sortedParsed = [
          ...activeUnderLimit,
          ...activeOverLimit,
          ...inactiveKeys
        ];
        apiKeysToUse = sortedParsed.map(k => k.rawKey);
      } else {
        // No active keys are under the limit! Try to activate an inactive backup key
        if (inactiveKeys.length > 0) {
          const keyToActivate = inactiveKeys[0];
          
          // Rebuild API keys with this one set to active
          const updatedApiKeys = apiKeysToUse.map((rawKey, index) => {
            if (index === keyToActivate.index) {
              const parts = rawKey.split("|");
              const name = parts.length > 1 ? parts[0] : `Key-${index + 1}`;
              const key = parts.length > 1 ? parts[1] : parts[0];
              return `${name}|${key}|true`;
            }
            return rawKey;
          });

          // Save to config
          aiConfig = AiConfigRepository.updateConfig({ apiKeys: updatedApiKeys });
          apiKeysToUse = [...aiConfig.apiKeys];

          broadcastLog(
            `[AI Smart Key] Semua key aktif mencapai limit (${limit}). Mengaktifkan key cadangan "${keyToActivate.name}" secara otomatis!`,
            "info"
          );

          // Now parse and sort again with the new active key
          const newToday = new Date().toISOString().slice(0, 10);
          const newDayStat = aiConfig.dailyStats?.[newToday] || { byKey: {} };
          const newParsedKeys = apiKeysToUse.map((rawKey, index) => {
            const parts = rawKey.split("|");
            const key = parts.length > 1 ? parts[1] : parts[0];
            const name = parts.length > 1 ? parts[0] : `Key-${index + 1}`;
            const isActive = parts.length > 2 ? parts[2] === "true" : true;
            const requestsToday = newDayStat.byKey?.[name] || 0;
            return { rawKey, name, key, isActive, requestsToday, index };
          });

          const newActive = newParsedKeys.filter(k => k.isActive);
          newActive.sort((a, b) => a.requestsToday - b.requestsToday);
          const newInactive = newParsedKeys.filter(k => !k.isActive);
          
          apiKeysToUse = [...newActive, ...newInactive].map(k => k.rawKey);
        } else {
          // No inactive keys to activate, just sort active keys by request count and proceed
          broadcastLog(
            `[AI Smart Key] Warning: Semua key telah mencapai limit (${limit}) dan tidak ada key cadangan!`,
            "error"
          );
          const sortedActive = [...activeKeys].sort((a, b) => a.requestsToday - b.requestsToday);
          apiKeysToUse = [...sortedActive, ...inactiveKeys].map(k => k.rawKey);
        }
      }
    }

    for (let i = 0; i < apiKeysToUse.length; i++) {
      const rawKey = apiKeysToUse[i];
      const parts = rawKey.split("|");
      const actualKey = parts.length > 1 ? parts[1] : parts[0];
      const keyName = parts.length > 1 ? parts[0] : `Key-${i + 1}`;
      const isActive = parts.length > 2 ? parts[2] === "true" : true;

      if (!isActive) continue;

      // Filter eligible models for this key based on cooldowns and unsupported status
      const eligibleModels = FALLBACK_MODELS.filter(modelName => {
        const cacheKey = `${keyName}|${modelName}`;
        if (this.unsupportedModels.has(cacheKey)) return false;
        
        const cooldownUntil = this.modelCooldowns.get(cacheKey);
        if (cooldownUntil && Date.now() < cooldownUntil) return false;
        
        return true;
      });

      if (eligibleModels.length === 0) {
        console.log(`[AI_DEBUG] Key ${keyName} tidak memiliki model yang siap (semua limit/tidak didukung).`);
        const fallbackMsg = i < apiKeysToUse.length - 1 ? " Fallback ke key berikutnya..." : "";
        broadcastLog(
          `[AI Token] ${keyName} semua model limit/tidak didukung.${fallbackMsg}`,
          "error",
        );
        continue; // Pindah ke key berikutnya
      }

      // Loop di dalam key yang aktif untuk mencari model yang tersedia
      for (let j = 0; j < eligibleModels.length; j++) {
        const currentModel = eligibleModels[j];
        const cacheKey = `${keyName}|${currentModel}`;
        const finalConfig = { model: currentModel, ...config };

        try {
          const genAI = new GoogleGenerativeAI(actualKey);
          const model = genAI.getGenerativeModel(finalConfig);
          const result = await model.generateContent(prompt);
          const text = result.response.text();

          // Simpan statistik sukses ke database
          AiConfigRepository.recordApiRequest(keyName, currentModel);

          return {
            text,
            keyName,
            modelName: currentModel,
          };
        } catch (error: any) {
          const errMsg = error?.message || String(error);
          
          // Check for rate limit
          const isRateLimit =
            error?.status === 429 ||
            errMsg.includes("429") ||
            errMsg.includes("Quota") ||
            errMsg.includes("rate limit") ||
            errMsg.includes("ResourceExhausted");

          // Check if key is invalid / disabled
          const isInvalidKey =
            errMsg.includes("API key not valid") ||
            errMsg.includes("API_KEY_INVALID") ||
            errMsg.includes("key is invalid") ||
            (error?.status === 400 && errMsg.includes("key"));

          // Check if model is not found / unsupported
          const isUnsupportedModel =
            error?.status === 404 ||
            error?.status === 403 ||
            errMsg.includes("not found") ||
            errMsg.includes("not supported") ||
            errMsg.includes("not available");

          // Simpan statistik limit hit ke database jika terkena limit
          if (isRateLimit) {
            AiConfigRepository.recordLimitHit(keyName);
            // Put this model on cooldown for 60 seconds
            this.modelCooldowns.set(cacheKey, Date.now() + 60000);
          }

          if (isUnsupportedModel) {
            // Mark model as unsupported permanently for this key
            this.unsupportedModels.add(cacheKey);
          }

          if (isInvalidKey) {
            console.log(`[AI_DEBUG] Key ${keyName} tidak valid/error: ${errMsg}. Pindah ke key berikutnya.`);
            if (i < apiKeysToUse.length - 1) {
              broadcastLog(
                `[AI Token] Key ${keyName} tidak valid/error. Fallback ke key berikutnya...`,
                "error",
              );
            }
            break; // Pecah loop model j, pindah ke key berikutnya i+1
          }

          if (j < eligibleModels.length - 1) {
            // Jika model ini limit atau error, lanjut ke model berikutnya di key yang sama
            if (isRateLimit) {
              console.log(
                `[AI_DEBUG] Model ${currentModel} di ${keyName} limit, ganti model...`,
              );
            } else if (isUnsupportedModel) {
              console.log(
                `[AI_DEBUG] Model ${currentModel} di ${keyName} tidak didukung/ditemukan. Mencoba model berikutnya...`,
              );
            } else {
              console.log(
                `[AI_DEBUG] Model ${currentModel} di ${keyName} error: ${errMsg}. Mencoba model berikutnya...`,
              );
            }
            continue;
          } else {
            // Jika SEMUA model eligible di key ini limit atau error, baru pindah ke key berikutnya
            const fallbackMsg = i < apiKeysToUse.length - 1 ? " Fallback ke key berikutnya..." : "";
            broadcastLog(
              `[AI Token] ${keyName} semua model limit/error.${fallbackMsg}`,
              "error",
            );
            break;
          }
        }
      }
    }
    throw new Error("Semua API Key dan Model kehabisan kuota atau dimatikan.");
  }

  public static async evaluateIntent(
    message: string,
    keyword: string,
    apiKeys: string[],
    blockedWords: string[] = [],
    customPrompt?: string,
  ): Promise<{ intent: "PROMOSI" | "SKIP"; reason: string; keyName?: string; model?: string }> {
    // CEK CACHE SEBELUM MANGGIL API GOOGLE
    const cleanMessage = message.trim().toLowerCase();
    const cacheKey = `${keyword}_${cleanMessage}`;

    if (intentCache.has(cacheKey)) {
      return intentCache.get(cacheKey)!;
    }

    try {
      const config = {
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              intent: {
                type: "STRING",
                enum: ["PROMOSI", "SKIP"],
              },
              reason: {
                type: "STRING",
              },
            },
            required: ["intent", "reason"],
          },
          temperature: 0.3,
        },
      };

      // Clean blocked words to avoid conflicting with the target keyword
      const cleanKw = keyword.toLowerCase().trim();
      const filteredBlockedWords = blockedWords.filter((word) => {
        const cleanWord = word.toLowerCase().trim();
        if (!cleanWord) return false;
        // If the blocked word is exactly the target keyword or vice versa, filter it out
        if (cleanWord === cleanKw || cleanKw.includes(cleanWord) || cleanWord.includes(cleanKw)) {
          return false;
        }
        return true;
      });

      const blockedContext =
        filteredBlockedWords.length > 0
          ? `\n- BLOCKED CONCEPTS (skip jika topik utamanya ini): [${filteredBlockedWords.join(", ")}].`
          : "";

      // ─── DEFAULT GLOBAL PROMPT ───────────────────────────────────────────────
      // ULTRA-AGGRESSIVE PROMOSI. Hampir semua pesan WAJIB PROMOSI.
      // SKIP hanya jika 100% yakin pengirim adalah COMPETITOR yang AKTIF JUALAN.
      const DEFAULT_PROMPT = `Kamu adalah classifier intent untuk bot auto-reply jual-beli di grup Telegram Indonesia.
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

      // Pilih prompt dasar
      const rawPrompt = (customPrompt && customPrompt.trim()) ? customPrompt : DEFAULT_PROMPT;

      // Lakukan interpolasi semua variabel kustom
      const finalPrompt = rawPrompt
        .replace(/@blockedkeyword/gi, filteredBlockedWords.length > 0 ? `\n- BLOCKED CONCEPTS (skip jika topik utamanya ini): [${filteredBlockedWords.join(", ")}].` : "")
        .replace(/@filterwords/gi, filteredBlockedWords.length > 0 ? `\n- BLOCKED CONCEPTS (skip jika topik utamanya ini): [${filteredBlockedWords.join(", ")}].` : "")
        .replace(/@keyword/gi, keyword)
        .replace(/@usermessage/gi, message)
        .replace(/\$\{keyword\}/g, keyword) // backward compatibility
        .replace(/\$\{message\}/g, message); // backward compatibility

      const execResult = await this.executeWithFallback(
        finalPrompt,
        apiKeys,
        config,
      );
      const parsed = this.parseJsonResponse(execResult.text);

      const result = {
        intent: parsed.intent === "PROMOSI" ? "PROMOSI" as const : "SKIP" as const,
        reason: parsed.reason || "Tidak ada alasan spesifik.",
        keyName: execResult.keyName,
        model: execResult.modelName,
      };

      // SIMPAN KE CACHE
      if (intentCache.size > 5000) {
        const firstKey = intentCache.keys().next().value;
        if (firstKey) intentCache.delete(firstKey);
      }
      intentCache.set(
        cacheKey,
        result as { intent: "PROMOSI" | "SKIP"; reason: string; keyName?: string; model?: string },
      );

      return result;
    } catch (error: any) {
      console.error("[AI_DEBUG] Error:", error.message);
      // Fail-safe → PROMOSI agar bot tetap reply meski API error.
      // Lebih baik reply terlalu banyak daripada kehilangan calon pembeli.
      return {
        intent: "PROMOSI",
        reason: `Fail-safe: API error, default ke PROMOSI. (${error.message})`,
      };
    }
  }

  public static clearCache(): void {
    intentCache.clear();
    console.log("[AI_DEBUG] Local memory cache cleared.");
  }


  /**
   * 1. AUTO GENERATE BLOCKED WORD
   */
  public static async generateBlockedWordVariants(
    baseWord: string,
    apiKeys: string[],
  ): Promise<string[]> {
    try {
      const config = {
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      };
      const prompt = `Act as an Indonesian internet slang expert. Generate 10-15 common variations, intentional typos, abbreviations, or spacing tricks used in Telegram to bypass filters for the word: "${baseWord}". 
Output ONLY a valid JSON array of strings. Example: ["var1", "var2"]`;

      const execResult = await this.executeWithFallback(
        prompt,
        apiKeys,
        config,
      );
      const parsed = this.parseJsonResponse(execResult.text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      console.error("[AI_DEBUG] Blocked Word Error:", error.message);
      throw error;
    }
  }

  /**
   * 2. AUTO GENERATE FAMILIAR KEYWORD
   */
  public static async generateKeywordVariants(
    keyword: string,
    apiKeys: string[],
  ): Promise<string[]> {
    try {
      const config = {
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.5,
        },
      };
      const prompt = `Act as an Indonesian e-commerce assistant. Generate 5-10 common, accidental mobile keyboard typos for the product keyword: "${keyword}". 
Output ONLY a valid JSON array of strings. Example: ["typo1", "typo2"]`;

      const execResult = await this.executeWithFallback(
        prompt,
        apiKeys,
        config,
      );
      const parsed = this.parseJsonResponse(execResult.text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      console.error("[AI_DEBUG] Keyword Variants Error:", error.message);
      throw error;
    }
  }

  /**
   * 3. SMART DEBUGGING
   */
  public static async analyzeErrorLog(
    errorMessage: string,
    apiKeys: string[],
  ): Promise<{ cause: string; solution: string } | null> {
    try {
      const config = {
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      };
      const prompt = `Act as a Senior DevOps. Analyze this NodeJS/Telegram bot error: "${errorMessage}". 
Output ONLY a valid JSON object with two keys:
- "cause": A brief, friendly explanation of the root cause in Indonesian.
- "solution": Concrete, actionable steps for the Admin to fix it via the dashboard, in Indonesian.`;

      const execResult = await this.executeWithFallback(
        prompt,
        apiKeys,
        config,
      );
      const parsed = this.parseJsonResponse(execResult.text);
      return parsed && parsed.cause && parsed.solution ? parsed : null;
    } catch (error: any) {
      console.error("[AI_DEBUG] Smart Debugging Error:", error.message);
      throw error;
    }
  }

  /**
   * 4. GENERATE LOG SUMMARY (AI LOG INTELLIGENCE)
   */
  public static async generateLogSummary(
    logSample: string,
    apiKeys: string[],
  ): Promise<{ performance: string; bannedAccounts: string[]; insights: string; aiUnderstanding: string } | null> {
    try {
      const config = {
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      };
      const prompt = `Act as an AI system analyst. Analyze the following log lines of a Telegram marketing bot:

${logSample}

Provide a structured summary in Indonesian containing:
1. "performance": A brief summary of how the bot and AI are performing (success rate of promotions vs skips, average activity level).
2. "bannedAccounts": An array of account names/IDs that are banned, restricted, or failing to send messages (based on errors like USER_BANNED_IN_CHANNEL, CHAT_WRITE_FORBIDDEN, FLOOD_WAIT, USER_DEACTIVATED_BAN, etc.).
3. "insights": What product keywords or message topics are most frequently received/processed.
4. "aiUnderstanding": How well the AI is classifying intents (ratio of PROMOSI to SKIP, and any noted patterns).

Output ONLY a valid JSON object matching this structure:
{
  "performance": "Summary...",
  "bannedAccounts": ["Account A", "Account B"],
  "insights": "Insights...",
  "aiUnderstanding": "Patterns..."
}`;

      const execResult = await this.executeWithFallback(
        prompt,
        apiKeys,
        config,
      );
      const parsed = this.parseJsonResponse(execResult.text);
      return parsed;
    } catch (error: any) {
      console.error("[AI_DEBUG] Log Summary Error:", error.message);
      throw error;
    }
  }
}
