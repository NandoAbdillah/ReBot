import { Router } from "express";
import net from "net";
import os from "os";
import fs from "fs";
import { TelegramClient } from "telegram";
import { DATA_DIR, DB_PATHS } from "../config/storage.js";
import { SettingsRepository } from "../repositories/SettingsRepository.js";
import { AccountRepository } from "../repositories/AccountRepository.js";
import { AutoBackupService } from "../services/AutoBackupService.js";

// Helper untuk cek latensi TCP ke Telegram DC 5 (IP: 91.108.56.147 port 443)
function pingTelegramDC5(timeoutMs = 4000): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.connect(443, "91.108.56.147", () => {
      const latencyMs = Date.now() - startTime;
      socket.destroy();
      resolve({ ok: true, latencyMs });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ ok: false, latencyMs: Date.now() - startTime, error: err.message });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, latencyMs: timeoutMs, error: "Connection Timeout (RTO)" });
    });
  });
}

// Format durasi detik ke teks manusiawi
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d} hari`);
  if (h > 0) parts.push(`${h} jam`);
  if (m > 0) parts.push(`${m} menit`);
  if (s > 0 || parts.length === 0) parts.push(`${s} detik`);
  return parts.join(", ");
}

export interface InspectRouterDeps {
  getLiveClients?: () => Map<string, TelegramClient>;
  broadcastLog?: (msg: string, type?: "info" | "success" | "error" | "bot" | "warning" | "ai") => void;
}

export function createInspectRouter(deps?: InspectRouterDeps) {
  const router = Router();

  // GET /api/deployment/inspect
  router.get("/inspect", async (_req, res) => {
    try {
      const isRailway = Boolean(
        process.env.RAILWAY_ENVIRONMENT_ID ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID ||
        process.env.RAILWAY_DEPLOYMENT_ID
      );

      const deploymentType = isRailway ? "Railway Cloud Container" : "Local Development / Self-Hosted";

      // Metadata Railway
      const railwayMeta = {
        isRailway,
        environmentName: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || "production",
        projectId: process.env.RAILWAY_PROJECT_ID || "local-project",
        projectName: process.env.RAILWAY_PROJECT_NAME || "LunoxyTelebot",
        serviceId: process.env.RAILWAY_SERVICE_ID || "service-telebot",
        serviceName: process.env.RAILWAY_SERVICE_NAME || "LunoxyTelebot Service",
        deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || "local-runtime",
        snapshotId: process.env.RAILWAY_SNAPSHOT_ID || null,
        publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL || null,
        region: process.env.RAILWAY_REGION || "us-west1",
        git: {
          repo: process.env.RAILWAY_GIT_REPO_NAME || null,
          branch: process.env.RAILWAY_GIT_BRANCH || null,
          commitSha: process.env.RAILWAY_GIT_COMMIT_SHA ? process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) : null,
          commitMessage: process.env.RAILWAY_GIT_COMMIT_MESSAGE || null,
          author: process.env.RAILWAY_GIT_AUTHOR || null,
        },
      };

      // Konfigurasi Trial tersimpan di Global Settings
      const globalSettings = SettingsRepository.getGlobalSettings() as any;
      const inspectConfig = globalSettings?.inspectConfig || {};

      // Waktu server mulai
      const uptimeSec = process.uptime();
      const serverStartTime = new Date(Date.now() - uptimeSec * 1000).toISOString();

      // Perhitungan Trial & Quota
      // Railway free trial: $5.00 credit / ~30 hari (~500 jam pemakaian aktif)
      const trialDurationDays = Number(inspectConfig.trialDurationDays || 21); // Default 21 hari (estimasi 500 jam kontainer berjalan non-stop pada trial $5)
      const totalCreditLimit = Number(inspectConfig.trialCreditLimit || 5.0);

      // Tanggal mulai trial: gunakan inspectConfig.trialStartDate atau fallback ke serverStartTime
      const trialStartDateStr = inspectConfig.trialStartDate || serverStartTime;
      const trialStartTime = new Date(trialStartDateStr).getTime();
      const now = Date.now();
      const elapsedMs = Math.max(0, now - trialStartTime);
      const elapsedDays = elapsedMs / (1000 * 3600 * 24);
      const elapsedHours = elapsedMs / (1000 * 3600);

      const remainingDays = Math.max(0, Number((trialDurationDays - elapsedDays).toFixed(2)));
      const remainingHours = Math.max(0, Math.floor(trialDurationDays * 24 - elapsedHours));

      // Estimasi konsumsi kredit Railway (sekitar $0.007 per jam untuk spek ~1 vCPU 1GB RAM)
      const estimatedCostPerHour = 0.007;
      const estimatedCreditUsed = Math.min(totalCreditLimit, Number((elapsedHours * estimatedCostPerHour).toFixed(2)));
      const estimatedCreditRemaining = Math.max(0, Number((totalCreditLimit - estimatedCreditUsed).toFixed(2)));

      // Estimasi tanggal habis
      const expirationDate = new Date(trialStartTime + trialDurationDays * 24 * 3600 * 1000).toISOString();

      // Status Trial Health
      let trialHealthStatus: "safe" | "warning" | "critical" = "safe";
      if (remainingDays <= 3) {
        trialHealthStatus = "critical";
      } else if (remainingDays <= 7) {
        trialHealthStatus = "warning";
      }

      // Memory & CPU Usage
      const memUsage = process.memoryUsage();
      const rssMB = Math.round(memUsage.rss / (1024 * 1024));
      const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));
      const heapTotalMB = Math.round(memUsage.heapTotal / (1024 * 1024));
      const systemTotalMB = Math.round(os.totalmem() / (1024 * 1024));
      const systemFreeMB = Math.round(os.freemem() / (1024 * 1024));
      const systemUsedMB = systemTotalMB - systemFreeMB;
      const systemMemoryPercent = Math.round((systemUsedMB / systemTotalMB) * 100);

      // Volume & Storage Status
      const isPersistentVolume = DATA_DIR !== "." && !DATA_DIR.startsWith("./");
      const accounts = AccountRepository.getAll();
      const accountsCount = accounts.length;
      
      const liveClientsMap = deps?.getLiveClients ? deps.getLiveClients() : new Map();
      const connectedAccountsCount = accounts.filter(a => liveClientsMap.get(a.accountId)?.connected).length;
      
      let dbFilesSize = 0;
      for (const p of Object.values(DB_PATHS)) {
        try {
          if (fs.existsSync(p)) {
            dbFilesSize += fs.statSync(p).size;
          }
        } catch { }
      }

      // Cek Konektivitas ke Telegram DC 5
      const dc5Check = await pingTelegramDC5();

      // Health Overall
      let overallStatus: "healthy" | "warning" | "critical" = "healthy";
      if (trialHealthStatus === "critical" || !dc5Check.ok || rssMB > 800) {
        overallStatus = "critical";
      } else if (trialHealthStatus === "warning" || rssMB > 500 || dc5Check.latencyMs > 250) {
        overallStatus = "warning";
      }

      res.json({
        success: true,
        overallStatus,
        deploymentType,
        railwayMeta,
        trial: {
          status: trialHealthStatus,
          trialStartDate: trialStartDateStr,
          trialDurationDays,
          totalCreditLimit,
          remainingDays,
          remainingHours,
          elapsedDays: Number(elapsedDays.toFixed(2)),
          elapsedHours: Math.floor(elapsedHours),
          estimatedCreditUsed,
          estimatedCreditRemaining,
          expirationDate,
          lastAutoTelegramBackupDate: inspectConfig.lastAutoTelegramBackupDate || null,
        },
        system: {
          uptimeSeconds: Math.floor(uptimeSec),
          uptimeFormatted: formatUptime(uptimeSec),
          serverStartTime,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          cpuCores: os.cpus().length,
          cpuModel: os.cpus()[0]?.model || "Standard vCPU",
          loadAvg: os.loadavg().map((l) => Number(l.toFixed(2))),
          memory: {
            rssMB,
            heapUsedMB,
            heapTotalMB,
            systemTotalMB,
            systemFreeMB,
            systemUsedMB,
            systemMemoryPercent,
          },
        },
        storage: {
          dataDir: DATA_DIR,
          isPersistentVolume,
          dbFilesSizeBytes: dbFilesSize,
          dbFilesSizeFormatted: `${(dbFilesSize / 1024).toFixed(1)} KB`,
          accountsCount,
          connectedAccountsCount,
        },
        network: {
          telegramDC5: {
            targetIp: "91.108.56.147",
            port: 443,
            ok: dc5Check.ok,
            latencyMs: dc5Check.latencyMs,
            error: dc5Check.error || null,
            note: "IP alternatif DC 5 (Patch IP 91.108.56.147 untuk cegah packet drop di Railway)",
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal mengambil data inspect deployment" });
    }
  });

  // POST /api/deployment/send-backup-telegram
  // Mengirim file snapshot backup ke Saved Messages akun Telegram
  router.post("/send-backup-telegram", async (req, res) => {
    try {
      const { accountId } = req.body || {};
      const getClient = (id: string) => (deps?.getLiveClients ? deps.getLiveClients().get(id) : undefined);

      const result = await AutoBackupService.sendBackupToTelegram(getClient, accountId);

      if (result.success) {
        if (deps?.broadcastLog) {
          deps.broadcastLog(
            `[SISTEM] Backup snapshot berhasil dikirim ke Pesan Tersimpan Telegram (${result.sentCount} akun).`,
            "success"
          );
        }
        res.json({
          success: true,
          message: `Berhasil mengirim backup ke ${result.sentCount} akun Telegram (Pesan Tersimpan).`,
          sentCount: result.sentCount,
          sentAccounts: result.sentAccounts,
          errors: result.errors,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.errors[0] || "Gagal mengirim backup ke Telegram.",
          errors: result.errors,
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Terjadi kesalahan saat memproses pengiriman backup Telegram." });
    }
  });

  // POST /api/deployment/inspect/calibrate
  // Kalibrasi cepat sisa hari / sisa saldo credit Railway
  router.post("/inspect/calibrate", (req, res) => {
    try {
      const { remainingDays, remainingCredit, totalCreditLimit = 5.0, trialDurationDays = 21 } = req.body;
      const currentSettings = SettingsRepository.getGlobalSettings() as any;
      const inspectConfig = currentSettings?.inspectConfig || {};

      let targetRemainingDays = Number(remainingDays);

      if (remainingCredit !== undefined && !isNaN(Number(remainingCredit))) {
        // Konversi credit tersisa ke sisa hari:
        // Misalnya: sisa $0.37 dari batas $5.00 dalam 21 hari
        const remCred = Math.max(0, Math.min(Number(totalCreditLimit), Number(remainingCredit)));
        targetRemainingDays = Number(((remCred / Number(totalCreditLimit)) * Number(trialDurationDays)).toFixed(2));
      }

      if (isNaN(targetRemainingDays) || targetRemainingDays < 0) {
        return res.status(400).json({ error: "Nilai remainingDays atau remainingCredit tidak valid." });
      }

      const now = Date.now();
      const elapsedDays = Math.max(0, Number(trialDurationDays) - targetRemainingDays);
      const newTrialStartTime = new Date(now - elapsedDays * 24 * 3600 * 1000).toISOString();

      const updatedInspectConfig = {
        ...inspectConfig,
        trialDurationDays: Number(trialDurationDays),
        trialCreditLimit: Number(totalCreditLimit),
        trialStartDate: newTrialStartTime,
      };

      currentSettings.inspectConfig = updatedInspectConfig;
      SettingsRepository.setGlobalSettings(currentSettings);

      if (deps?.broadcastLog) {
        deps.broadcastLog(
          `[SISTEM] Kalibrasi trial disinkronkan: Sisa ${targetRemainingDays.toFixed(1)} hari (Estimasi $${((targetRemainingDays / Number(trialDurationDays)) * Number(totalCreditLimit)).toFixed(2)}).`,
          "info"
        );
      }

      res.json({
        success: true,
        message: "Kalibrasi berhasil diperbarui.",
        inspectConfig: updatedInspectConfig,
        remainingDays: targetRemainingDays,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal melakukan kalibrasi trial." });
    }
  });

  // POST /api/deployment/inspect/config
  // Mengatur tanggal mulai trial atau durasi hari untuk kalibrasi monitoring
  router.post("/inspect/config", (req, res) => {
    try {
      const { trialStartDate, trialDurationDays, trialCreditLimit } = req.body;
      const currentSettings = SettingsRepository.getGlobalSettings() as any;

      const updatedInspectConfig = {
        ...(currentSettings.inspectConfig || {}),
        ...(trialStartDate ? { trialStartDate: String(trialStartDate).trim() } : {}),
        ...(trialDurationDays ? { trialDurationDays: Number(trialDurationDays) } : {}),
        ...(trialCreditLimit ? { trialCreditLimit: Number(trialCreditLimit) } : {}),
      };

      currentSettings.inspectConfig = updatedInspectConfig;
      SettingsRepository.setGlobalSettings(currentSettings);

      res.json({ success: true, inspectConfig: updatedInspectConfig });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Gagal menyimpan konfigurasi inspect" });
    }
  });

  return router;
}
