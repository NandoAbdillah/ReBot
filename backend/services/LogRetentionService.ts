// backend/services/LogRetentionService.ts
import fs from "fs";
import path from "path";
import { LOGS_DIR, DB_PATHS, MEDIA_DIR, DATA_DIR } from "../config/storage.js";

export interface StorageBreakdown {
  logsBytes: number;
  logsCount: number;
  backupsBytes: number;
  backupsCount: number;
  mediaBytes: number;
  mediaCount: number;
  dbBytes: number;
  totalBytes: number;
  retentionDays: number;
}

export class LogRetentionService {
  public static readonly MAX_RETENTION_DAYS = 2; // Hanya simpan 2 hari terakhir (Hari Ini & Kemarin)
  private static pruneTimer: NodeJS.Timeout | null = null;

  public static init(): void {
    console.log(`[LogRetention] Layanan retensi aktif: batas penyimpanan riil maksimal ${this.MAX_RETENTION_DAYS} hari.`);
    // 1. Bersihkan seketika saat server boot
    this.pruneAll();

    // 2. Jalankan pembersihan otomatis setiap 1 jam
    if (!this.pruneTimer) {
      this.pruneTimer = setInterval(() => {
        this.pruneAll();
      }, 60 * 60 * 1000);
    }
  }

  /**
   * Menghitung tanggal batas retensi (Cutoff ISO YYYY-MM-DD)
   */
  public static getCutoffDateStr(daysToKeep = this.MAX_RETENTION_DAYS): string {
    const d = new Date();
    // Kurangi hari (misal 2 hari: hari ini T, kemarin T-1, cutoff adalah T-1)
    d.setDate(d.getDate() - (daysToKeep - 1));
    return d.toISOString().slice(0, 10);
  }

  /**
   * Menghapus secara permanen file log yang lebih tua dari batas retensi (fs.unlinkSync)
   */
  public static pruneLogs(daysToKeep = this.MAX_RETENTION_DAYS): { deletedFiles: string[]; freedBytes: number } {
    const result = { deletedFiles: [] as string[], freedBytes: 0 };
    if (!fs.existsSync(LOGS_DIR)) return result;

    const cutoffDate = this.getCutoffDateStr(daysToKeep);

    try {
      const files = fs.readdirSync(LOGS_DIR);
      for (const file of files) {
        const match = file.match(/^logs-(\d{4}-\d{2}-\d{2})\.txt$/);
        if (!match) continue;

        const fileDate = match[1];
        // Jika tanggal file lebih kecil dari cutoffDate, hapus permanen!
        if (fileDate < cutoffDate) {
          const filePath = path.join(LOGS_DIR, file);
          try {
            const stat = fs.statSync(filePath);
            result.freedBytes += stat.size;
            fs.unlinkSync(filePath);
            result.deletedFiles.push(file);
            console.log(`[LogRetention] HAPUS FISIK RIIL: ${file} (${(stat.size / 1024).toFixed(1)} KB) dibersihkan dari disk Railway.`);
          } catch (err: any) {
            console.error(`[LogRetention] Gagal menghapus file log "${file}":`, err.message);
          }
        }
      }
    } catch (e: any) {
      console.error("[LogRetention] Gagal memindai direktori log:", e.message);
    }

    return result;
  }

  /**
   * Menghapus snapshot backup harian lama di data/backups/ yang melebihi batas 2 hari
   */
  public static pruneBackups(daysToKeep = this.MAX_RETENTION_DAYS): { deletedBackups: string[]; freedBytes: number } {
    const result = { deletedBackups: [] as string[], freedBytes: 0 };
    if (!fs.existsSync(DB_PATHS.BACKUP_DIR)) return result;

    const cutoffDate = this.getCutoffDateStr(daysToKeep);

    try {
      const files = fs.readdirSync(DB_PATHS.BACKUP_DIR);
      for (const file of files) {
        // Jangan hapus snapshot auto-backup-latest.json
        if (file === "auto-backup-latest.json") continue;

        const match = file.match(/^auto-backup-(\d{4}-\d{2}-\d{2})\.json$/);
        if (!match) continue;

        const fileDate = match[1];
        if (fileDate < cutoffDate) {
          const filePath = path.join(DB_PATHS.BACKUP_DIR, file);
          try {
            const stat = fs.statSync(filePath);
            result.freedBytes += stat.size;
            fs.unlinkSync(filePath);
            result.deletedBackups.push(file);
            console.log(`[LogRetention] HAPUS BACKUP RIIL: ${file} (${(stat.size / 1024 / 1024).toFixed(2)} MB) dibersihkan dari disk Railway.`);
          } catch (err: any) {
            console.error(`[LogRetention] Gagal menghapus file backup "${file}":`, err.message);
          }
        }
      }
    } catch (e: any) {
      console.error("[LogRetention] Gagal memindai direktori backup:", e.message);
    }

    return result;
  }

  /**
   * Eksekusi seluruh pembersihan riil (Logs + Backups)
   */
  public static pruneAll(): { logsFreedBytes: number; backupsFreedBytes: number; deletedLogsCount: number; deletedBackupsCount: number } {
    const logRes = this.pruneLogs();
    const backupRes = this.pruneBackups();

    const totalFreed = logRes.freedBytes + backupRes.freedBytes;
    if (totalFreed > 0) {
      console.log(`[LogRetention] Total ruang disk dibebaskan: ${(totalFreed / 1024 / 1024).toFixed(2)} MB (${logRes.deletedFiles.length} log, ${backupRes.deletedBackups.length} backup).`);
    }

    return {
      logsFreedBytes: logRes.freedBytes,
      backupsFreedBytes: backupRes.freedBytes,
      deletedLogsCount: logRes.deletedFiles.length,
      deletedBackupsCount: backupRes.deletedBackups.length,
    };
  }

  /**
   * Menghitung ukuran fisik nyata dari seluruh file di storage (Volume Railway)
   */
  public static getStorageUsage(): StorageBreakdown {
    let logsBytes = 0;
    let logsCount = 0;
    if (fs.existsSync(LOGS_DIR)) {
      try {
        const files = fs.readdirSync(LOGS_DIR);
        for (const f of files) {
          const fp = path.join(LOGS_DIR, f);
          if (fs.statSync(fp).isFile()) {
            logsBytes += fs.statSync(fp).size;
            logsCount++;
          }
        }
      } catch {}
    }

    let backupsBytes = 0;
    let backupsCount = 0;
    if (fs.existsSync(DB_PATHS.BACKUP_DIR)) {
      try {
        const files = fs.readdirSync(DB_PATHS.BACKUP_DIR);
        for (const f of files) {
          const fp = path.join(DB_PATHS.BACKUP_DIR, f);
          if (fs.statSync(fp).isFile()) {
            backupsBytes += fs.statSync(fp).size;
            backupsCount++;
          }
        }
      } catch {}
    }

    let mediaBytes = 0;
    let mediaCount = 0;
    if (fs.existsSync(MEDIA_DIR)) {
      try {
        const files = fs.readdirSync(MEDIA_DIR);
        for (const f of files) {
          const fp = path.join(MEDIA_DIR, f);
          if (fs.statSync(fp).isFile()) {
            mediaBytes += fs.statSync(fp).size;
            mediaCount++;
          }
        }
      } catch {}
    }

    let dbBytes = 0;
    const dbFileList = [
      DB_PATHS.ACCOUNTS,
      DB_PATHS.SETTINGS,
      DB_PATHS.ACCOUNT_SETTINGS,
      DB_PATHS.STATS,
      DB_PATHS.AI_CONFIG,
    ];
    for (const dbf of dbFileList) {
      if (fs.existsSync(dbf)) {
        try {
          dbBytes += fs.statSync(dbf).size;
        } catch {}
      }
    }

    return {
      logsBytes,
      logsCount,
      backupsBytes,
      backupsCount,
      mediaBytes,
      mediaCount,
      dbBytes,
      totalBytes: logsBytes + backupsBytes + mediaBytes + dbBytes,
      retentionDays: this.MAX_RETENTION_DAYS,
    };
  }
}
