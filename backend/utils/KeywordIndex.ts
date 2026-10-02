/**
 * KeywordIndex.ts
 * Pre-indexed keyword lookup using HashMap for O(W) matching per message.
 * Replaces O(N × M) regex-per-keyword loop with single-pass word tokenization.
 */

import { normalizeForKeyword } from "./matching.ts";

export interface KeywordMatchResult {
  type: "broadcast" | "trigger";
  keyword: string;           // original keyword string
  normalizedKeyword: string; // normalized for matching
  rule: any;                 // original rule/job object reference
}

interface IndexEntry {
  fullNormalized: string;    // full normalized keyword phrase
  wordCount: number;         // number of words in keyword
  result: KeywordMatchResult;
}

export class KeywordIndex {
  /** Map from first normalized word → list of possible matches */
  private wordIndex = new Map<string, IndexEntry[]>();
  /** Single-word exact matches for fastest path */
  private singleWordIndex = new Map<string, KeywordMatchResult>();
  /** Total keyword count for diagnostics */
  private totalKeywords = 0;

  /**
   * Build the index from broadcast jobs and response rules.
   * Call this once when settings change, not per-message.
   */
  build(
    broadcastJobs: any[],
    responseRules: any[],
  ): void {
    this.wordIndex.clear();
    this.singleWordIndex.clear();
    this.totalKeywords = 0;

    // Index broadcast job keywords
    const activeKeywordJobs = (broadcastJobs || []).filter(
      (job) => job.isActive && job.keywords && job.keywords.length > 0 && job.targetGroup,
    );

    for (const job of activeKeywordJobs) {
      for (const kw of job.keywords) {
        this.addKeyword(kw, { type: "broadcast", keyword: kw, normalizedKeyword: "", rule: job });
      }
    }

    // Index response rule keywords (sorted by longest keyword first for priority)
    for (const rule of responseRules || []) {
      let kws: string[] = [];
      if (Array.isArray((rule as any).keywords)) {
        kws = (rule as any).keywords;
      } else if (typeof (rule as any).keyword === "string") {
        kws = (rule as any).keyword
          .split(",")
          .map((k: string) => k.trim());
      }
      // Sort by length descending — longest keyword gets priority
      kws.sort((a, b) => b.length - a.length);

      for (const kw of kws) {
        this.addKeyword(kw, { type: "trigger", keyword: kw, normalizedKeyword: "", rule });
      }
    }
  }

  private addKeyword(rawKeyword: string, result: KeywordMatchResult): void {
    const k = (rawKeyword || "").trim();
    if (!k) return;

    // Guardrail: skip single non-alphanumeric symbols
    if (k.length === 1 && !/[a-z0-9]/i.test(k)) return;
    if (/^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(k)) return;

    const normalized = normalizeForKeyword(k);
    if (!normalized) return;

    result.normalizedKeyword = normalized;
    this.totalKeywords++;

    const words = normalized.split(" ").filter(Boolean);
    if (words.length === 0) return;

    const firstWord = words[0];

    if (words.length === 1) {
      // Single-word keyword — store in fast exact-match map
      // First match wins (don't overwrite if already indexed)
      if (!this.singleWordIndex.has(firstWord)) {
        this.singleWordIndex.set(firstWord, result);
      }
    }

    // Always store in wordIndex for multi-word phrase matching
    const entry: IndexEntry = {
      fullNormalized: normalized,
      wordCount: words.length,
      result,
    };

    if (!this.wordIndex.has(firstWord)) {
      this.wordIndex.set(firstWord, []);
    }
    this.wordIndex.get(firstWord)!.push(entry);
  }

  /**
   * Match a message text against the pre-built index.
   * Returns the first matching result, or null if no match.
   *
   * Matching strategy:
   * 1. Normalize message text once
   * 2. Tokenize into words
   * 3. For each word, check singleWordIndex (O(1) lookup)
   * 4. For each word, check wordIndex for multi-word phrases (verify substring containment)
   * 5. Also check raw text with word-boundary awareness for special characters
   */
  match(rawText: string): KeywordMatchResult | null {
    if (!rawText) return null;

    const normalizedText = normalizeForKeyword(rawText);
    if (!normalizedText) return null;

    const lowerRaw = rawText.toLowerCase();
    const words = normalizedText.split(" ").filter(Boolean);

    // Track which words we've already checked to avoid duplicate lookups
    const checkedWords = new Set<string>();

    for (const word of words) {
      if (checkedWords.has(word)) continue;
      checkedWords.add(word);

      // Fast path: single-word exact match
      const singleMatch = this.singleWordIndex.get(word);
      if (singleMatch) {
        // Verify word boundary: ensure it's a standalone word, not part of a larger word
        if (this.hasWordBoundary(normalizedText, word)) {
          return singleMatch;
        }
      }

      // Multi-word phrase check
      const entries = this.wordIndex.get(word);
      if (!entries) continue;

      for (const entry of entries) {
        if (entry.wordCount === 1) {
          // Already checked via singleWordIndex above, but verify boundary
          if (this.hasWordBoundary(normalizedText, entry.fullNormalized)) {
            return entry.result;
          }
        } else {
          // Multi-word: check if the full normalized keyword phrase exists in normalized text
          if (this.hasWordBoundary(normalizedText, entry.fullNormalized)) {
            return entry.result;
          }
        }
      }
    }

    // Fallback: check raw text for keywords with special characters (e.g., "@username")
    // This handles edge cases where normalization strips meaningful chars
    for (const [, entries] of this.wordIndex) {
      for (const entry of entries) {
        const rawKw = entry.result.keyword.toLowerCase().trim();
        // Only do this fallback for keywords containing special chars
        if (rawKw !== entry.fullNormalized && lowerRaw.includes(rawKw)) {
          return entry.result;
        }
      }
    }

    return null;
  }

  /**
   * Check if `keyword` exists in `text` with word boundaries.
   * Uses indexOf + boundary check instead of regex for performance.
   */
  private hasWordBoundary(text: string, keyword: string): boolean {
    let startPos = 0;
    while (true) {
      const idx = text.indexOf(keyword, startPos);
      if (idx === -1) return false;

      const charBefore = idx > 0 ? text[idx - 1] : " ";
      const charAfter = idx + keyword.length < text.length ? text[idx + keyword.length] : " ";

      const boundaryBefore = !this.isAlphaNum(charBefore);
      const boundaryAfter = !this.isAlphaNum(charAfter);

      if (boundaryBefore && boundaryAfter) return true;

      startPos = idx + 1;
    }
  }

  private isAlphaNum(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
      (code >= 48 && code <= 57) ||  // 0-9
      (code >= 65 && code <= 90) ||  // A-Z
      (code >= 97 && code <= 122)    // a-z
    );
  }

  /** Get total indexed keyword count for diagnostics */
  getKeywordCount(): number {
    return this.totalKeywords;
  }

  /** Check if index has been built */
  isEmpty(): boolean {
    return this.totalKeywords === 0;
  }
}

/**
 * Per-account keyword index cache.
 * Rebuild when settings change.
 */
const accountIndexCache = new Map<string, KeywordIndex>();

export function getKeywordIndex(
  accountId: string,
  broadcastJobs: any[],
  responseRules: any[],
  forceRebuild = false,
): KeywordIndex {
  if (!forceRebuild && accountIndexCache.has(accountId)) {
    return accountIndexCache.get(accountId)!;
  }

  const index = new KeywordIndex();
  index.build(broadcastJobs, responseRules);
  accountIndexCache.set(accountId, index);
  return index;
}

export function invalidateKeywordIndex(accountId: string): void {
  accountIndexCache.delete(accountId);
}

export function invalidateAllKeywordIndexes(): void {
  accountIndexCache.clear();
}
