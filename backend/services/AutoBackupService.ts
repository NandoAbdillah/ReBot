// backend/services/AutoBackupService.ts
import fs from "fs";
import path from "path";
import { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import { DB_PATHS, MEDIA_DIR, LOGS_DIR } from "../config/storage.js";
import { AccountRepository } from "../repositories/AccountRepository.js";
import { SettingsRepository } from "../repositories/SettingsRepository.js";
import { AiConfigRepository } from "../repositories/AiConfigRepository.js";
import { StatsRepository } from "../repositories/StatsRepository.js";
import { LogRetentionService } from "./LogRetentionService.js";

export class AutoBackupService {
  private static backupTimer: NodeJS.Timeout | null = null;
  private static debouncedTimer: NodeJS.Timeout | null = null;
  private static trialCheckTimer: NodeJS.Timeout | null = null;
  private static clientGetter: (() => Map<string, TelegramClient>) | null = null;

  public static setClientGetter(fn: () => Map<string, TelegramClient>): void {
    this.clientGetter = fn;
  }

  public static init(clientGetter?: () => Map<string, TelegramClient>): void {
    if (clientGetter) {
      this.clientGetter = clientGetter;
    }

    if (!fs.existsSync(DB_PATHS.BACKUP_DIR)) {
      fs.mkdirSync(DB_PATHS.BACKUP_DIR, { recursive: true });
    }

    // 1. Cek & Pulihkan otomatis jika terjadi crash/reset di Railway (container force restart)
    this.checkAndAutoRecover();

    // 2. Jadwalkan auto-backup berkala setiap 15 menit
    if (!this.backupTimer) {
      this.backupTimer = setInterval(() => {
        this.createSnapshot();
      }, 15 * 60 * 1000);
    }

    // 3. Jadwalkan pengecekan sisa masa aktif trial ke Telegram Saved Messages setiap 1 jam
    if (!this.trialCheckTimer) {
      this.trialCheckTimer = setInterval(() => {
        if (this.clientGetter) {
          const map = this.clientGetter();
          this.checkCriticalTrialAutoBackup((id) => map.get(id));
        }
      }, 60 * 60 * 1000);
    }
  }

  /**
   * Pemicu backup debounced saat ada perubahan data di repository
   */
  public static triggerAutoBackup(): void {
    if (this.debouncedTimer) clearTimeout(this.debouncedTimer);
    this.debouncedTimer = setTimeout(() => {
      this.createSnapshot();
    }, 3000);
  }

  /**
   * Mengumpulkan semua file media lokal dari MEDIA_DIR dan mengonversinya ke Data URI (base64)
   */
  public static collectMediaBase64(mediaFilenames?: string[]): Record<string, string> {
    const mediaMap: Record<string, string> = {};
    if (!fs.existsSync(MEDIA_DIR)) return mediaMap;

    try {
      const files = fs.readdirSync(MEDIA_DIR);
      for (const file of files) {
        // Jika parameter mediaFilenames diberikan, hanya ambil media yang relevan
        if (mediaFilenames && mediaFilenames.length > 0 && !mediaFilenames.includes(file)) {
          continue;
        }
        const filePath = path.join(MEDIA_DIR, file);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(file).toLowerCase();
          let mime = "application/octet-stream";
          if ([".jpg", ".jpeg"].includes(ext)) mime = "image/jpeg";
          else if (ext === ".png") mime = "image/png";
          else if (ext === ".webp") mime = "image/webp";
          else if (ext === ".mp4") mime = "video/mp4";
          else if (ext === ".mp3") mime = "audio/mpeg";

          const fileBuf = fs.readFileSync(filePath);
          mediaMap[file] = `data:${mime};base64,${fileBuf.toString("base64")}`;
        }
      }
    } catch (e) {
      console.error("[AutoBackup] Gagal mengumpulkan media base64:", e);
    }
    return mediaMap;
  }

  /**
   * Mengekstrak embeddedMedia dari paket backup kembali ke direktori MEDIA_DIR di disk
   */
  public static restoreMediaFromBase64(embeddedMedia?: Record<string, string>): number {
    if (!embeddedMedia || typeof embeddedMedia !== "object") return 0;
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }

    let restoredCount = 0;
    for (const [filename, dataUri] of Object.entries(embeddedMedia)) {
      if (!filename || typeof dataUri !== "string") continue;
      try {
        const base64Data = dataUri.replace(/^data:.*;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const safeName = path.basename(filename);
        const targetPath = path.join(MEDIA_DIR, safeName);
        fs.writeFileSync(targetPath, buffer);
        restoredCount++;
      } catch (err) {
        console.error(`[AutoBackup] Gagal mengekstrak file media "${filename}":`, err);
      }
    }
    return restoredCount;
  }

  /**
   * Mengumpulkan semua file log dari LOGS_DIR
   */
  public static collectLogs(): Record<string, string> {
    const logsMap: Record<string, string> = {};
    if (!fs.existsSync(LOGS_DIR)) return logsMap;

    const cutoffDate = LogRetentionService.getCutoffDateStr();

    try {
      const files = fs.readdirSync(LOGS_DIR);
      for (const file of files) {
        const match = file.match(/^logs-(\d{4}-\d{2}-\d{2})\.txt$/);
        if (match) {
          const fileDate = match[1];
          // Hanya kumpulkan log 2 hari terakhir ke dalam snapshot backup
          if (fileDate >= cutoffDate) {
            const filePath = path.join(LOGS_DIR, file);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              logsMap[file] = fs.readFileSync(filePath, "utf8");
            }
          }
        }
      }
    } catch (e) {
      console.error("[AutoBackup] Gagal mengumpulkan logs:", e);
    }
    return logsMap;
  }

  /**
   * Mengekstrak logs dari paket backup kembali ke direktori LOGS_DIR di disk
   */
  public static restoreLogs(logsMap?: Record<string, string>): number {
    if (!logsMap || typeof logsMap !== "object") return 0;
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    let restoredCount = 0;
    for (const [filename, content] of Object.entries(logsMap)) {
      if (!filename || typeof content !== "string" || !filename.endsWith(".txt")) continue;
      try {
        const safeName = path.basename(filename);
        const targetPath = path.join(LOGS_DIR, safeName);
        fs.writeFileSync(targetPath, content, "utf8");
        restoredCount++;
      } catch (err) {
        console.error(`[AutoBackup] Gagal mengekstrak file log "${filename}":`, err);
      }
    }
    return restoredCount;
  }

  /**
   * Membersihkan semua file di dalam suatu direktori (100% clean overwrite)
   */
  public static clearDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;
    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (err) {
      console.error(`[AutoBackup] Gagal membersihkan direktori "${dirPath}":`, err);
    }
  }

  /**
   * Membuat snapshot backup lengkap (accounts, accountSettings, globalSettings, aiConfig, stats, logs, embeddedMedia)
   */
  public static createSnapshot(): string | null {
    try {
      if (!fs.existsSync(DB_PATHS.BACKUP_DIR)) {
        fs.mkdirSync(DB_PATHS.BACKUP_DIR, { recursive: true });
      }

      const globalSettings = SettingsRepository.getGlobalSettings();
      const accounts = AccountRepository.getAll();
      const accountSettings: Record<string, any> = {};
      for (const acc of accounts) {
        accountSettings[acc.accountId] = SettingsRepository.getAccountSettings(acc.accountId);
      }
      const aiConfig = AiConfigRepository.getConfig();
      const stats = StatsRepository.getStatsData();
      const logs = this.collectLogs();
      const embeddedMedia = this.collectMediaBase64();

      const snapshot = {
        version: "3.0",
        type: "full-package",
        exportedAt: new Date().toISOString(),
        globalSettings,
        accounts,
        accountSettings,
        aiConfig,
        stats,
        logs,
        embeddedMedia,
      };

      const jsonStr = JSON.stringify(snapshot, null, 2);

      // Simpan ke auto-backup-latest.json
      const latestPath = path.join(DB_PATHS.BACKUP_DIR, "auto-backup-latest.json");
      fs.writeFileSync(latestPath, jsonStr);

      // Simpan backup harian
      const today = new Date().toISOString().slice(0, 10);
      const dailyPath = path.join(DB_PATHS.BACKUP_DIR, `auto-backup-${today}.json`);
      fs.writeFileSync(dailyPath, jsonStr);

      // Otomatis hapus snapshot backup fisik lama (> 2 hari) agar volume Railway tidak membengkak
      LogRetentionService.pruneBackups();

      console.log(`[AutoBackup] Snapshot otomatis tersimpan di ${latestPath}`);
      return latestPath;
    } catch (e) {
      console.error("[AutoBackup] Gagal membuat snapshot auto-backup:", e);
      return null;
    }
  }

  /**
   * Mengirim file backup JSON snapshot langsung ke Pesan Tersimpan ("me" / Saved Messages) akun Telegram
   */
  public static async sendBackupToTelegram(
    getClient: (accountId: string) => TelegramClient | undefined,
    targetAccountId?: string
  ): Promise<{ success: boolean; sentCount: number; errors: string[]; sentAccounts: string[] }> {
    const errors: string[] = [];
    const sentAccounts: string[] = [];
    let sentCount = 0;

    try {
      // 1. Pastikan snapshot terbaru tersedia
      const snapshotPath = this.createSnapshot();
      if (!snapshotPath || !fs.existsSync(snapshotPath)) {
        return {
          success: false,
          sentCount: 0,
          sentAccounts: [],
          errors: ["Gagal membuat file snapshot backup di disk server."],
        };
      }

      const fileBuffer = fs.readFileSync(snapshotPath);
      const accounts = AccountRepository.getAll();
      const targetAccounts = targetAccountId
        ? accounts.filter((a) => a.accountId === targetAccountId)
        : accounts;

      if (targetAccounts.length === 0) {
        return {
          success: false,
          sentCount: 0,
          sentAccounts: [],
          errors: ["Tidak ada akun Telegram yang terdaftar untuk dikirimi backup."],
        };
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const fileName = `lunoxy-telebot-backup-${todayStr}.json`;
      const timeWIB = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) + " WIB";

      for (const acc of targetAccounts) {
        const client = getClient(acc.accountId);
        if (!client || !client.connected) {
          errors.push(`[${acc.accountId}] Akun tidak terhubung (offline).`);
          continue;
        }

        try {
          const caption =
            `[LUNOXY TELEBOT - SISTEM CADANGAN OTOMATIS]\n` +
            `Waktu Backup: ${timeWIB}\n` +
            `Akun: ${acc.accountId}\n` +
            `Total Akun Terdaftar: ${accounts.length} Akun\n` +
            `Status: Cadangan data konfigurasi bot lengkap siap pulihkan.\n\n` +
            `Panduan Pemulihan:\n` +
            `1. Unduh file ${fileName} ini ke perangkat Anda.\n` +
            `2. Buka dashboard LunoxyTelebot di server baru.\n` +
            `3. Klik tombol "Impor Konfigurasi" dan pilih file ini.\n` +
            `4. Seluruh bot, keyword, target, dan sesi langsung aktif kembali.`;

          const customFile = new CustomFile(fileName, fileBuffer.byteLength, snapshotPath, fileBuffer);

          await (client as any).sendFile("me", {
            file: customFile,
            caption,
            forceDocument: true,
          });

          sentCount++;
          sentAccounts.push(acc.accountId);
          console.log(`[AutoBackup] Berhasil mengirim file backup ke Pesan Tersimpan (Saved Messages) akun: ${acc.accountId}`);
        } catch (err: any) {
          const errMsg = `[${acc.accountId}] Gagal kirim ke Saved Messages: ${err.message || String(err)}`;
          errors.push(errMsg);
          console.error("[AutoBackup]", errMsg);
        }
      }

      return {
        success: sentCount > 0,
        sentCount,
        sentAccounts,
        errors,
      };
    } catch (e: any) {
      console.error("[AutoBackup] Error sendBackupToTelegram:", e);
      return {
        success: false,
        sentCount: 0,
        sentAccounts: [],
        errors: [e.message || "Terjadi kesalahan internal saat mengirim backup ke Telegram."],
      };
    }
  }

  /**
   * Cek berkala: jika sisa masa aktif trial <= 4 hari, kirim otomatis snapshot backup ke Saved Messages
   */
  public static async checkCriticalTrialAutoBackup(
    getClient: (accountId: string) => TelegramClient | undefined
  ): Promise<void> {
    try {
      const globalSettings = SettingsRepository.getGlobalSettings() as any;
      const inspectConfig = globalSettings?.inspectConfig || {};

      const trialDurationDays = Number(inspectConfig.trialDurationDays || 21);
      const trialStartDateStr = inspectConfig.trialStartDate || new Date().toISOString();
      const trialStartTime = new Date(trialStartDateStr).getTime();
      const now = Date.now();
      const elapsedDays = Math.max(0, (now - trialStartTime) / (1000 * 3600 * 24));
      const remainingDays = Math.max(0, Number((trialDurationDays - elapsedDays).toFixed(1)));

      // Jika sisa hari <= 4 hari
      if (remainingDays <= 4) {
        const todayKey = new Date().toISOString().slice(0, 10);
        if (inspectConfig.lastAutoTelegramBackupDate !== todayKey) {
          console.log(`[AutoBackup] Sisa trial Railway menipis (${remainingDays} hari). Mengirim backup darurat ke Telegram...`);
          const result = await this.sendBackupToTelegram(getClient);
          if (result.success) {
            inspectConfig.lastAutoTelegramBackupDate = todayKey;
            globalSettings.inspectConfig = inspectConfig;
            SettingsRepository.setGlobalSettings(globalSettings);
            console.log(`[AutoBackup] Berhasil auto-backup sisa trial ke ${result.sentCount} akun Telegram.`);
          }
        }
      }
    } catch (err) {
      console.error("[AutoBackup] Error checkCriticalTrialAutoBackup:", err);
    }
  }

  /**
   * Cek jika database kosong/korup karena Railway crash/reset, dan pulihkan dari backup terbaru secara otomatis
   */
  public static checkAndAutoRecover(): boolean {
    AccountRepository.load();
    SettingsRepository.load();

    const accounts = AccountRepository.getAll();
    const hasAccounts = accounts.length > 0;

    // Jika akun sudah ada dan valid, tidak perlu pemulihan otomatis
    if (hasAccounts) return false;

    // Cari file backup terbaru di BACKUP_DIR
    if (!fs.existsSync(DB_PATHS.BACKUP_DIR)) return false;

    const files = fs.readdirSync(DB_PATHS.BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith("auto-backup-") && f.endsWith(".json"))
      .sort((a, b) => b.localeCompare(a)); // Terbaru dulu

    if (backupFiles.length === 0) return false;

    const targetBackup = backupFiles.includes("auto-backup-latest.json")
      ? "auto-backup-latest.json"
      : backupFiles[0];

    const backupFilePath = path.join(DB_PATHS.BACKUP_DIR, targetBackup);

    try {
      console.warn(`[AutoBackup] DETEKSI DATA KOSONG (Railway/Cloud Container Reset)!`);
      console.warn(`[AutoBackup] Memulihkan data otomatis dari: ${backupFilePath}`);

      const raw = fs.readFileSync(backupFilePath, "utf8");
      const packageData = JSON.parse(raw);

      if (packageData.globalSettings) {
        SettingsRepository.setGlobalSettings(packageData.globalSettings);
      }

      if (Array.isArray(packageData.accounts)) {
        fs.writeFileSync(DB_PATHS.ACCOUNTS, JSON.stringify(packageData.accounts, null, 2));
        AccountRepository.reload();
      }

      if (packageData.accountSettings && typeof packageData.accountSettings === "object") {
        fs.writeFileSync(DB_PATHS.ACCOUNT_SETTINGS, JSON.stringify(packageData.accountSettings, null, 2));
        SettingsRepository.reload();
      }

      if (packageData.aiConfig && typeof packageData.aiConfig === "object") {
        fs.writeFileSync(DB_PATHS.AI_CONFIG, JSON.stringify(packageData.aiConfig, null, 2));
        AiConfigRepository.reload();
      }

      if (packageData.stats && typeof packageData.stats === "object") {
        fs.writeFileSync(DB_PATHS.STATS, JSON.stringify(packageData.stats, null, 2));
        StatsRepository.reload();
      }

      if (packageData.embeddedMedia) {
        this.clearDirectory(MEDIA_DIR);
        this.restoreMediaFromBase64(packageData.embeddedMedia);
      }

      if (packageData.logs) {
        this.clearDirectory(LOGS_DIR);
        this.restoreLogs(packageData.logs);
      }

      console.log(`[AutoBackup] SELAMAT! Pemulihan otomatis berhasil. Data akun, media, stats & logs telah dikembalikan.`);
      return true;
    } catch (e) {
      console.error("[AutoBackup] Gagal melakukan pemulihan otomatis dari backup:", e);
      return false;
    }
  }
}
