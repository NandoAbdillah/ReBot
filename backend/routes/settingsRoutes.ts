import { Router } from "express";
import fs from "fs";
import { TelegramClient } from "telegram";
import { DB_PATHS, MEDIA_DIR, LOGS_DIR } from "../config/storage.js";
import {
  SettingsRepository,
  sanitizeSettings,
  BotSettings,
} from "../repositories/SettingsRepository.js";
import { AccountRepository } from "../repositories/AccountRepository.js";
import { AiConfigRepository } from "../repositories/AiConfigRepository.js";
import { StatsRepository } from "../repositories/StatsRepository.js";
import { AutoBackupService } from "../services/AutoBackupService.js";
import { AIService } from "../services/AIService.js";

export interface SettingsRouterDependencies {
  getAccountSettings: (id: string) => BotSettings;
  setAccountSettings: (
    id: string,
    s: Partial<BotSettings>,
  ) => { settings: BotSettings; changed: boolean };
  getGlobalSettings: () => BotSettings;
  setGlobalSettings: (s: BotSettings) => void;
  liveClients: Map<string, TelegramClient>;
  broadcastLog: (
    msg: string,
    type?: "info" | "success" | "error" | "bot" | "warning" | "ai",
  ) => void;
  resetAllRuntimeState: () => Promise<void>;
  autoReconnectAll: () => Promise<void>;
  onSettingsUpdated?: () => void;
}

export function createSettingsRouter(deps: SettingsRouterDependencies) {
  const router = Router();

  // POST /api/settings (Global settings)
  router.post("/settings", (req, res) => {
    const current = deps.getGlobalSettings();
    const updated = sanitizeSettings({ ...current, ...req.body });
    deps.setGlobalSettings(updated);
    AIService.clearCache();
    if (deps.onSettingsUpdated) deps.onSettingsUpdated();
    res.json({ success: true });
  });

  // GET /api/account/:accountId/settings
  router.get("/account/:accountId/settings", (req, res) => {
    const accId = String(req.params.accountId || "").trim();
    if (!accId) return res.status(400).json({ error: "accountId required" });
    res.json(deps.getAccountSettings(accId));
  });

  // POST /api/account/:accountId/settings
  router.post("/account/:accountId/settings", (req, res) => {
    const accId = String(req.params.accountId || "").trim();
    if (!accId) return res.status(400).json({ error: "accountId required" });
    const { settings: updated, changed } = deps.setAccountSettings(
      accId,
      req.body,
    );
    if (changed) {
      deps.broadcastLog(`[${accId}] Pengaturan diperbarui.`, "info");
    }
    res.json(updated);
  });

  // POST /api/account/:accountId/resolve-target
  router.post("/account/:accountId/resolve-target", async (req, res) => {
    const accId = String(req.params.accountId || "").trim();
    const target = String(req.body?.target || "").trim();
    if (!accId || !target) {
      return res.status(400).json({ error: "accountId dan target wajib diisi" });
    }

    const client = deps.liveClients.get(accId);
    if (!client?.connected) {
      return res.status(400).json({ error: "Akun tidak terkoneksi" });
    }

    try {
      const entity: any = await client.getEntity(target);
      const rawId = entity?.id ? String(entity.id) : "";
      const normalizedId = rawId ? `-100${rawId}` : target;
      res.json({
        id: normalizedId,
        rawId,
        title: entity?.title || entity?.firstName || entity?.username || target,
        type: entity?.className || "unknown",
        username: entity?.username || null,
        membersCount: entity?.participantsCount || null,
      });
    } catch (e: any) {
      res.status(400).json({ error: `Tidak bisa resolve: ${e.message}` });
    }
  });

  // GET /api/account/:accountId/export
  router.get("/account/:accountId/export", (req, res) => {
    try {
      const accId = String(req.params.accountId || "").trim();
      if (!accId) return res.status(400).json({ error: "accountId required" });

      const settings = deps.getAccountSettings(accId);

      // Kumpulkan media filenames dari responses akun ini
      const mediaFilenames: string[] = [];
      if (Array.isArray(settings.responses)) {
        settings.responses.forEach((rule: any) => {
          if (Array.isArray(rule.replies)) {
            rule.replies.forEach((rep: any) => {
              if (Array.isArray(rep.media)) {
                rep.media.forEach((m: string) => mediaFilenames.push(m));
              }
            });
          }
        });
      }

      const embeddedMedia = AutoBackupService.collectMediaBase64(mediaFilenames);

      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        accountId: accId,
        settings,
        embeddedMedia,
      };

      // Sanitisasi nama file untuk HTTP header agar tidak crash pada karakter unicode
      const safeHeaderId = accId.replace(/[^\x20-\x7E]/g, "_");
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="teleoffer-backup-${safeHeaderId}-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      res.json(exportData);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: `Gagal mengekspor konfigurasi akun: ${err.message}` });
    }
  });

  // POST /api/account/:accountId/import
  router.post("/account/:accountId/import", (req, res) => {
    const accId = String(req.params.accountId || "").trim();
    if (!accId) return res.status(400).json({ error: "accountId required" });

    const importData = req.body;
    if (!importData || typeof importData !== "object" || !importData.settings) {
      return res.status(400).json({
        error: "Format file tidak valid. Pastikan file berisi field 'settings'.",
      });
    }

    try {
      const { settings: updated } = deps.setAccountSettings(
        accId,
        importData.settings,
      );

      if (importData.embeddedMedia) {
        AutoBackupService.restoreMediaFromBase64(importData.embeddedMedia);
      }
      AutoBackupService.triggerAutoBackup();

      deps.broadcastLog(`[${accId}] Konfigurasi diimpor dari backup.`, "info");
      res.json({ success: true, settings: updated });
    } catch (e: any) {
      res.status(500).json({ error: `Gagal mengimpor: ${e.message}` });
    }
  });

  // GET /api/export-all
  router.get("/export-all", (_req, res) => {
    try {
      const globalSettings = SettingsRepository.getGlobalSettings();
      const allAccounts = AccountRepository.getAll();
      const accountSettings: Record<string, BotSettings> = {};
      for (const acc of allAccounts) {
        accountSettings[acc.accountId] = SettingsRepository.getAccountSettings(
          acc.accountId,
        );
      }
      const aiConfig = AiConfigRepository.getConfig();
      const stats = StatsRepository.getStatsData();
      const logs = AutoBackupService.collectLogs();
      const embeddedMedia = AutoBackupService.collectMediaBase64();

      const fullPackage = {
        version: "3.0",
        type: "full-package",
        exportedAt: new Date().toISOString(),
        globalSettings,
        accounts: allAccounts,
        accountSettings,
        aiConfig,
        stats,
        logs,
        embeddedMedia,
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="teleoffer-full-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      res.json(fullPackage);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: `Gagal mengekspor seluruh konfigurasi: ${err.message}` });
    }
  });

  // POST /api/import-all
  router.post("/import-all", async (req, res) => {
    const packageData = req.body;
    if (!packageData || typeof packageData !== "object") {
      return res.status(400).json({
        error: "Format file tidak valid. Mohon unggah file JSON backup.",
      });
    }

    try {
      deps.broadcastLog("Memulai proses impor seluruh konfigurasi...", "info");

      // 1. Reset client runtime dan memory queue
      await deps.resetAllRuntimeState();

      let importedAccountsCount = 0;
      let importedSettingsCount = 0;

      // 2. Impor Global Settings jika ada
      if (
        packageData.globalSettings &&
        typeof packageData.globalSettings === "object"
      ) {
        SettingsRepository.setGlobalSettings(packageData.globalSettings);
      }

      // 3. Impor Accounts jika ada
      if (Array.isArray(packageData.accounts)) {
        fs.writeFileSync(
          DB_PATHS.ACCOUNTS,
          JSON.stringify(packageData.accounts, null, 2),
        );
        AccountRepository.reload();
        importedAccountsCount = packageData.accounts.length;
      }

      // 4. Impor Account Settings jika ada
      if (
        packageData.accountSettings &&
        typeof packageData.accountSettings === "object"
      ) {
        fs.writeFileSync(
          DB_PATHS.ACCOUNT_SETTINGS,
          JSON.stringify(packageData.accountSettings, null, 2),
        );
        SettingsRepository.reload();
        importedSettingsCount = Object.keys(packageData.accountSettings).length;
      } else if (packageData.settings && packageData.accountId) {
        const fallbackSettings: Record<string, any> = {};
        fallbackSettings[packageData.accountId] = packageData.settings;
        fs.writeFileSync(
          DB_PATHS.ACCOUNT_SETTINGS,
          JSON.stringify(fallbackSettings, null, 2),
        );
        SettingsRepository.reload();
        importedSettingsCount = 1;
      }

      // 5. Impor AI Config jika ada
      if (packageData.aiConfig && typeof packageData.aiConfig === "object") {
        fs.writeFileSync(
          DB_PATHS.AI_CONFIG,
          JSON.stringify(packageData.aiConfig, null, 2),
        );
        AiConfigRepository.reload();
      }

      // 6. Impor Stats jika ada
      if (packageData.stats && typeof packageData.stats === "object") {
        fs.writeFileSync(
          DB_PATHS.STATS,
          JSON.stringify(packageData.stats, null, 2),
        );
        StatsRepository.reload();
      }

      // 7. Impor Embedded Media jika ada
      if (packageData.embeddedMedia) {
        AutoBackupService.clearDirectory(MEDIA_DIR);
        AutoBackupService.restoreMediaFromBase64(packageData.embeddedMedia);
      }

      // 8. Impor Logs jika ada
      if (packageData.logs) {
        AutoBackupService.clearDirectory(LOGS_DIR);
        AutoBackupService.restoreLogs(packageData.logs);
      }

      if (deps.onSettingsUpdated) {
        deps.onSettingsUpdated();
      }

      AIService.clearCache();

      // 9. Hubungkan kembali semua bot secara otomatis berdasarkan data yang baru diimpor
      deps.autoReconnectAll().catch((err) => {
        console.error("Gagal melakukan auto-reconnect setelah impor:", err);
      });

      AutoBackupService.triggerAutoBackup();
      deps.broadcastLog(
        "Seluruh paket konfigurasi berhasil diimpor & dipulihkan!",
        "success",
      );

      res.json({
        success: true,
        message: `Berhasil mengimpor seluruh konfigurasi (${importedAccountsCount} akun, ${importedSettingsCount} pengaturan akun)!`,
      });
    } catch (err: any) {
      console.error("Gagal mengimpor seluruh konfigurasi:", err);
      res.status(500).json({
        error: `Gagal mengimpor seluruh konfigurasi: ${err.message}`,
      });
    }
  });

  return router;
}
