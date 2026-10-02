// backend/repositories/StatsRepository.ts
import fs from "fs";
import { DB_PATHS } from "../config/storage.js";

export interface GroupStatEntry {
  total: number;
  byAccount: Record<string, number>;
}

export interface KeywordStatEntry {
  total: number;
  byAccount: Record<string, number>;
  byGroup: Record<string, number>;
}

export interface FunnelStats {
  messagesHeard: number;        // Total chat yang didengar bot di grup target
  keywordMatches: number;       // Chat yang cocok dengan keyword
  blockedFilterWords: number;   // Chat cocok keyword tapi dibatalkan kata terlarang
  blockedReasons?: Record<string, number>; // Breakdown kata terlarang (kata -> jumlah pencegatan)
  skippedPostFilter: number;    // Pesan cocok keyword tapi dilewati filter lanjutan (source, sender, target, AI)
  deliveryFailed?: number;      // Pesan lolos filter tapi gagal di antrean/MTProto
  slowmodeDelayed: number;      // Pesan tertahan delay slowmode grup
  floodWaitCount: number;       // Kejadian rate-limit telegram (FLOOD_WAIT)
  triggerSuccess?: number;      // Subtotal pesan auto-reply trigger
  broadcastSuccess?: number;    // Subtotal pesan broadcaster
}

export interface DailyStats {
  success: number;              // Total keseluruhan (Trigger + Broadcast)
  triggerSuccess?: number;      // Subtotal pesan balasan otomatis (trigger)
  broadcastSuccess?: number;    // Subtotal pesan iklan broadcast
  failed: number;
  byAccount: Record<string, { success: number; triggerSuccess?: number; broadcastSuccess?: number; failed: number }>;
  byGroup?: Record<string, GroupStatEntry>;
  byKeyword?: Record<string, KeywordStatEntry>;
  funnel?: FunnelStats;
}

export class StatsRepository {
  public static dailyStatsMap = new Map<string, DailyStats>();
  private static isLoaded = false;

  public static load(): void {
    if (this.isLoaded) return;
    if (!fs.existsSync(DB_PATHS.STATS)) {
      this.isLoaded = true;
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(DB_PATHS.STATS, "utf8"));
      if (typeof raw === "object" && !Array.isArray(raw)) {
        for (const [date, s] of Object.entries(raw)) {
          const stats = s as any;
          // Migrate legacy byGroup (Record<string,number>) to new format
          let byGroup: Record<string, GroupStatEntry> = {};
          if (typeof stats?.byGroup === "object" && stats.byGroup) {
            for (const [gid, val] of Object.entries(stats.byGroup)) {
              if (typeof val === "number") {
                // Legacy format: just a number — migrate to new format
                byGroup[gid] = { total: val as number, byAccount: {} };
              } else if (val && typeof val === "object") {
                byGroup[gid] = val as GroupStatEntry;
              }
            }
          }
          let byKeyword: Record<string, KeywordStatEntry> = {};
          if (typeof stats?.byKeyword === "object" && stats.byKeyword) {
            byKeyword = stats.byKeyword;
          }
          let funnel: FunnelStats = {
            messagesHeard: 0,
            keywordMatches: 0,
            blockedFilterWords: 0,
            skippedPostFilter: 0,
            slowmodeDelayed: 0,
            floodWaitCount: 0,
          };
          if (stats?.funnel && typeof stats.funnel === "object") {
            funnel = {
              messagesHeard: Number(stats.funnel.messagesHeard || 0),
              keywordMatches: Number(stats.funnel.keywordMatches || 0),
              blockedFilterWords: Number(stats.funnel.blockedFilterWords || 0),
              skippedPostFilter: Number(stats.funnel.skippedPostFilter || 0),
              slowmodeDelayed: Number(stats.funnel.slowmodeDelayed || 0),
              floodWaitCount: Number(stats.funnel.floodWaitCount || 0),
            };
          }
          const successTotal = Number(stats?.success || 0);
          const broadcastSuccess = Number(stats?.broadcastSuccess || 0);
          const triggerSuccess = typeof stats?.triggerSuccess === "number"
            ? stats.triggerSuccess
            : Math.max(0, successTotal - broadcastSuccess);

          this.dailyStatsMap.set(date, {
            success: successTotal,
            triggerSuccess,
            broadcastSuccess,
            failed: Number(stats?.failed || 0),
            byAccount: (typeof stats?.byAccount === "object" && stats.byAccount) ? stats.byAccount : {},
            byGroup,
            byKeyword,
            funnel,
          });
        }
      }
    } catch (e) { console.error("[DB] Failed to load stats", e); }
    this.isLoaded = true;
  }

  private static saveTimeout: NodeJS.Timeout | null = null;

  public static save(): void {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        const obj: Record<string, DailyStats> = {};
        for (const [date, s] of this.dailyStatsMap) {
          if (date >= cutoffStr) obj[date] = s;
        }
        fs.promises.writeFile(DB_PATHS.STATS, JSON.stringify(obj, null, 2)).catch((err) => {
          console.error("[DB] Failed to save stats async:", err);
        });
      } catch (e) {
        console.error("[DB] Error in stats save:", e);
      }
    }, 1500);
  }

  public static getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public static recordSendResult(
    type: "success" | "failed",
    accountId?: string,
    groupId?: string,
    keyword?: string,
  ): void {
    this.load();
    const key = this.getTodayKey();
    const current = this.dailyStatsMap.get(key) || {
      success: 0,
      failed: 0,
      byAccount: {},
      byGroup: {},
      byKeyword: {},
    };

    current[type]++;

    if (type === "success") {
      current.triggerSuccess = (current.triggerSuccess || 0) + 1;
    }

    if (accountId) {
      if (!current.byAccount[accountId]) current.byAccount[accountId] = { success: 0, failed: 0 };
      current.byAccount[accountId][type]++;
      if (type === "success") {
        current.byAccount[accountId].triggerSuccess = (current.byAccount[accountId].triggerSuccess || 0) + 1;
      }
    }

    if (groupId && type === "success") {
      if (!current.byGroup) current.byGroup = {};
      if (!current.byGroup[groupId]) current.byGroup[groupId] = { total: 0, byAccount: {} };
      current.byGroup[groupId].total++;
      if (accountId) {
        current.byGroup[groupId].byAccount[accountId] =
          (current.byGroup[groupId].byAccount[accountId] || 0) + 1;
      }
    }

    if (keyword && type === "success") {
      if (!current.byKeyword) current.byKeyword = {};
      if (!current.byKeyword[keyword]) current.byKeyword[keyword] = { total: 0, byAccount: {}, byGroup: {} };
      current.byKeyword[keyword].total++;
      if (accountId) {
        current.byKeyword[keyword].byAccount[accountId] =
          (current.byKeyword[keyword].byAccount[accountId] || 0) + 1;
      }
      if (groupId) {
        current.byKeyword[keyword].byGroup[groupId] =
          (current.byKeyword[keyword].byGroup[groupId] || 0) + 1;
      }
    }

    this.dailyStatsMap.set(key, current);
    this.save();
  }

  /**
   * Catat pengiriman pesan broadcast yang berhasil
   */
  public static recordBroadcastSuccess(accountId?: string, groupId?: string): void {
    this.load();
    const key = this.getTodayKey();
    const current = this.dailyStatsMap.get(key) || {
      success: 0,
      triggerSuccess: 0,
      broadcastSuccess: 0,
      failed: 0,
      byAccount: {},
      byGroup: {},
      byKeyword: {},
    };

    current.success++;
    current.broadcastSuccess = (current.broadcastSuccess || 0) + 1;

    if (accountId) {
      if (!current.byAccount[accountId]) {
        current.byAccount[accountId] = { success: 0, triggerSuccess: 0, broadcastSuccess: 0, failed: 0 };
      }
      current.byAccount[accountId].success++;
      current.byAccount[accountId].broadcastSuccess = (current.byAccount[accountId].broadcastSuccess || 0) + 1;
    }

    if (groupId) {
      if (!current.byGroup) current.byGroup = {};
      if (!current.byGroup[groupId]) current.byGroup[groupId] = { total: 0, byAccount: {} };
      current.byGroup[groupId].total++;
      if (accountId) {
        current.byGroup[groupId].byAccount[accountId] =
          (current.byGroup[groupId].byAccount[accountId] || 0) + 1;
      }
    }

    this.dailyStatsMap.set(key, current);
    this.save();
  }

  /** Ambil stats grup hari ini saja (daily reset otomatis) */
  public static getGroupStatsToday(): Record<string, GroupStatEntry> {
    this.load();
    const key = this.getTodayKey();
    return this.dailyStatsMap.get(key)?.byGroup || {};
  }

  /** Ambil stats keyword hari ini saja */
  public static getKeywordStatsToday(): Record<string, KeywordStatEntry> {
    this.load();
    const key = this.getTodayKey();
    return this.dailyStatsMap.get(key)?.byKeyword || {};
  }

  /** Legacy: total sendCount per-group (all time, for backward compat) */
  public static getGroupStats(accountId?: string): Record<string, number> {
    this.load();
    const stats: Record<string, number> = {};
    for (const [, s] of this.dailyStatsMap) {
      if (s.byGroup) {
        for (const [groupId, entry] of Object.entries(s.byGroup)) {
          const count = typeof entry === "number" ? entry : entry.total;
          stats[groupId] = (stats[groupId] || 0) + count;
        }
      }
    }
    return stats;
  }

  /** Catat event ke dalam corong pesan (Funnel) harian */
  public static recordFunnelEvent(
    event: "heard" | "keyword" | "blocked" | "skipped" | "delivery_failed" | "slowmode" | "flood",
    count = 1,
    reason?: string
  ): void {
    this.load();
    const key = this.getTodayKey();
    const current = this.dailyStatsMap.get(key) || {
      success: 0,
      failed: 0,
      byAccount: {},
      byGroup: {},
      byKeyword: {},
      funnel: {
        messagesHeard: 0,
        keywordMatches: 0,
        blockedFilterWords: 0,
        blockedReasons: {},
        skippedPostFilter: 0,
        deliveryFailed: 0,
        slowmodeDelayed: 0,
        floodWaitCount: 0,
      },
    };

    if (!current.funnel) {
      current.funnel = {
        messagesHeard: 0,
        keywordMatches: 0,
        blockedFilterWords: 0,
        blockedReasons: {},
        skippedPostFilter: 0,
        deliveryFailed: 0,
        slowmodeDelayed: 0,
        floodWaitCount: 0,
      };
    }

    if (!current.funnel.blockedReasons) {
      current.funnel.blockedReasons = {};
    }

    if (event === "heard") {
      current.funnel.messagesHeard += count;
    } else if (event === "keyword") {
      current.funnel.keywordMatches += count;
    } else if (event === "blocked") {
      current.funnel.blockedFilterWords += count;
      if (reason) {
        const cleanReason = String(reason || "").trim().toLowerCase();
        if (cleanReason) {
          current.funnel.blockedReasons[cleanReason] = (current.funnel.blockedReasons[cleanReason] || 0) + count;
        }
      }
    } else if (event === "skipped") {
      current.funnel.skippedPostFilter += count;
    } else if (event === "delivery_failed") {
      current.funnel.deliveryFailed = (current.funnel.deliveryFailed || 0) + count;
    } else if (event === "slowmode") {
      current.funnel.slowmodeDelayed += count;
    } else if (event === "flood") {
      current.funnel.floodWaitCount += count;
    }

    this.dailyStatsMap.set(key, current);
    this.save();
  }

  /** Ambil data corong pesan hari ini */
  public static getFunnelToday(): FunnelStats {
    this.load();
    const key = this.getTodayKey();
    const todayEntry = this.dailyStatsMap.get(key);
    const funnel = todayEntry?.funnel || {
      messagesHeard: 0,
      keywordMatches: 0,
      blockedFilterWords: 0,
      blockedReasons: {},
      skippedPostFilter: 0,
      deliveryFailed: 0,
      slowmodeDelayed: 0,
      floodWaitCount: 0,
    };
    const bSuccess = Number(todayEntry?.broadcastSuccess || 0);
    const tSuccess = typeof todayEntry?.triggerSuccess === "number"
      ? todayEntry.triggerSuccess
      : Math.max(0, Number(todayEntry?.success || 0) - bSuccess);

    return {
      ...funnel,
      deliveryFailed: funnel.deliveryFailed || 0,
      blockedReasons: funnel.blockedReasons || {},
      triggerSuccess: tSuccess,
      broadcastSuccess: bSuccess,
    };
  }

  /**
   * Menghasilkan saran tindakan cerdas (Actionable Advice) berbasis angka nyata
   * agar klien (Shelly) punya kepastian dan tidak sekadar restart berulang kali.
   */
  public static getSmartAdvice(
    funnel: FunnelStats,
    successCount: number,
    failedCount: number,
    isAnyActive: boolean,
    totalAccounts: number
  ): { title: string; type: "info" | "warning" | "success" | "tip"; message: string }[] {
    const advice: { title: string; type: "info" | "warning" | "success" | "tip"; message: string }[] = [];

    if (!isAnyActive) {
      advice.push({
        title: "Semua Akun Nonaktif (Standby)",
        type: "warning",
        message: "Seluruh bot dalam status OFF. Bot tidak akan membalas pesan apapun. Klik tombol 'Start All' di Dashboard untuk mulai merespons chat grup.",
      });
      return advice;
    }

    if (funnel.messagesHeard === 0) {
      advice.push({
        title: "Belum Ada Obrolan Masuk di Grup",
        type: "info",
        message: "Bot sedang aktif bersiaga (standby), namun belum ada orang yang mengetik pesan di grup tujuan hari ini. Begitu ada obrolan masuk, bot akan langsung merespons.",
      });
    } else if (funnel.messagesHeard > 30 && funnel.keywordMatches === 0) {
      advice.push({
        title: "Grup Ramai, Tapi Belum Ada yang Menyebut Keyword",
        type: "tip",
        message: `Bot sudah membaca ${funnel.messagesHeard} chat di grup hari ini, tetapi belum ada yang menyebut keyword Anda. Saran: Coba tambahkan variasi keyword yang lebih umum (misal: 'need', 'butuh', 'cari', 'ready', atau singkatan produk) di pengaturan akun.`,
      });
    }

    if (funnel.blockedFilterWords > 0) {
      const topReasons = Object.entries(funnel.blockedReasons || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `"${k}" (${v}x)`)
        .join(", ");

      const reasonSuffix = topReasons ? ` Kata yang paling sering mencegat: ${topReasons}.` : "";
      advice.push({
        title: `${funnel.blockedFilterWords} Pesan Dibatalkan oleh Filter Kata Terlarang`,
        type: "warning",
        message: `Ada ${funnel.blockedFilterWords} chat yang sebenarnya cocok dengan keyword Anda, tetapi dibatalkan karena mengandung kata di daftar 'Filter Words'.${reasonSuffix} Periksa menu Filter Words di akun untuk mengevaluasi kata yang terlalu ketat.`,
      });
    }

    const triggerCount = funnel.triggerSuccess ?? Math.max(0, successCount - (funnel.broadcastSuccess || 0));
    const broadcastCount = funnel.broadcastSuccess ?? 0;

    if (funnel.keywordMatches > 50 && triggerCount <= 5) {
      advice.push({
        title: "Peluang Keyword Banyak, Tapi Balasan Masih Sedikit?",
        type: "tip",
        message: `Terdeteksi ${funnel.keywordMatches} kecocokan kata kunci di grup, namun baru ${triggerCount} balasan terkirim. Hal ini karena: (1) pesan berada di grup yang tidak ditargetkan oleh akun tersebut, (2) postingan channel sudah pernah dibalas sebelumnya (anti-spam thread), atau (3) dicegat kata terlarang. Pastikan menu 'Target Groups' di setiap akun sudah mencakup grup-grup yang aktif.`,
      });
    }

    if (broadcastCount > 0) {
      advice.push({
        title: `${broadcastCount} Pesan Iklan Broadcast Sukses Terkirim`,
        type: "success",
        message: `Broadcaster terjadwal telah berhasil mengirim ${broadcastCount} pesan siaran ke grup target secara otomatis hari ini.`,
      });
    }

    if (funnel.slowmodeDelayed > 0) {
      advice.push({
        title: "Grup Menerapkan Slow Mode Telegram",
        type: "info",
        message: `Grup tujuan membatasi jeda pengiriman pesan (Slowmode). Bot sengaja mengantre dengan aman agar nomor HP tidak diblokir admin. Jika ingin balasan lebih banyak dan cepat, tambahkan akun bot kedua agar bisa membalas bergantian.`,
      });
    }

    if (funnel.floodWaitCount > 2) {
      advice.push({
        title: "Terkena Pembatasan Kecepatan Telegram (Rate Limit)",
        type: "warning",
        message: `Akun bot telah terkena Flood Wait ${funnel.floodWaitCount} kali karena kecepatan kirim tinggi. Hindari merestart bot berulang kali saat ini. Disarankan menambah akun bot tambahan agar beban pengiriman terbagi rata.`,
      });
    }

    if (successCount > 0 && advice.length === 0) {
      advice.push({
        title: "Kinerja Bot Sangat Optimal",
        type: "success",
        message: `Bot telah sukses mengirim ${successCount} balasan dari ${funnel.messagesHeard} obrolan yang didengar hari ini. Semua filter dan jeda pengiriman berjalan normal sesuai aturan Telegram.`,
      });
    }

    return advice;
  }

  public static reload(): void {
    this.isLoaded = false;
    this.dailyStatsMap.clear();
    this.load();
  }

  public static getStatsData(): Record<string, DailyStats> {
    this.load();
    const obj: Record<string, DailyStats> = {};
    for (const [date, s] of this.dailyStatsMap) {
      obj[date] = s;
    }
    return obj;
  }
}