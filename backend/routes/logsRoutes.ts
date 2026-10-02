import { Router } from "express";
import fs from "fs";
import path from "path";
import { LOGS_DIR } from "../config/storage.js";
import { Logger } from "../utils/Logger.js";
import { AiConfigRepository } from "../repositories/AiConfigRepository.js";
import { AIService } from "../services/AIService.js";
import { LogRetentionService } from "../services/LogRetentionService.js";

interface LogsRouterDeps {
  broadcastLog: (msg: string, type?: "info" | "success" | "error") => void;
  getErrorLogs: (accountId?: string) => any[];
}

export function createLogsRouter(deps: LogsRouterDeps) {
  const router = Router();

  // GET /api/logs → memory log history
  router.get("/", (_req, res) => {
    res.json({ logs: [...Logger.logHistory].reverse() });
  });

  // GET /api/logs/dates → available log dates on disk
  router.get("/dates", (_req, res) => {
    try {
      if (!fs.existsSync(LOGS_DIR)) {
        return res.json({ dates: [] });
      }
      const files = fs.readdirSync(LOGS_DIR);
      const dates = files
        .filter((f) => f.startsWith("logs-") && f.endsWith(".txt"))
        .map((f) => f.replace("logs-", "").replace(".txt", ""))
        .sort((a, b) => b.localeCompare(a));
      res.json({ dates });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/logs/storage-usage → physical disk usage breakdown (Volume Railway)
  router.get("/storage-usage", (_req, res) => {
    try {
      const usage = LogRetentionService.getStorageUsage();
      res.json({ success: true, usage });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/logs/prune-retention → trigger physical permanent deletion of logs & backups > 2 days
  router.post("/prune-retention", (_req, res) => {
    try {
      const result = LogRetentionService.pruneAll();
      const freedMb = ((result.logsFreedBytes + result.backupsFreedBytes) / 1024 / 1024).toFixed(2);
      deps.broadcastLog(`[SISTEM] Pembersihan disk berhasil: ${freedMb} MB dibebaskan (${result.deletedLogsCount} file log, ${result.deletedBackupsCount} snapshot backup dihapus fisik).`, "info");
      res.json({
        success: true,
        message: `Pembersihan berhasil: ${freedMb} MB dibebaskan dari disk Railway (${result.deletedLogsCount} file log lama dihapus).`,
        ...result,
      });
    } catch (e: any) {
      res.status(500).json({ error: `Gagal menjalankan pembersihan retensi: ${e.message}` });
    }
  });

  // GET /api/logs/view/:date → read parsed log entries for a date
  router.get("/view/:date", (req, res) => {
    const dateStr = String(req.params.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "Format tanggal tidak valid (YYYY-MM-DD)" });
    }
    const logFilePath = path.join(LOGS_DIR, `logs-${dateStr}.txt`);
    if (!fs.existsSync(logFilePath)) {
      return res.json({ logs: [] });
    }
    try {
      const lines = fs.readFileSync(logFilePath, "utf8").split("\n").filter(Boolean);
      const parsed = lines.map((line) => {
        const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
        if (match) {
          return {
            timestamp: match[1],
            type: match[2].toLowerCase(),
            message: match[3],
          };
        }
        return { timestamp: new Date().toISOString(), type: "info", message: line };
      });
      res.json({ logs: parsed.reverse() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/logs/download/:date → download raw log file
  router.get("/download/:date", (req, res) => {
    const dateStr = String(req.params.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "Format tanggal tidak valid (YYYY-MM-DD)" });
    }
    const logFilePath = path.join(LOGS_DIR, `logs-${dateStr}.txt`);
    if (!fs.existsSync(logFilePath)) {
      return res.status(404).json({ error: "File log tidak ditemukan untuk tanggal tersebut." });
    }
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="teleoffer-logs-${dateStr}.txt"`);
    res.sendFile(logFilePath);
  });

  // POST /api/logs/analyze → AI log summary
  router.post("/analyze", async (req, res) => {
    const range = String(req.body.range || "1d").trim();
    const aiConfig = AiConfigRepository.getConfig();
    if (!aiConfig.isActive || aiConfig.apiKeys.length === 0) {
      return res.status(400).json({ error: "AI Service nonaktif atau API Key kosong." });
    }

    let cutoffMs = 0;
    const now = Date.now();
    if (range === "30m") cutoffMs = now - 30 * 60 * 1000;
    else if (range === "1h") cutoffMs = now - 60 * 60 * 1000;
    else cutoffMs = now - 24 * 60 * 60 * 1000;

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const logFilePath = path.join(LOGS_DIR, `logs-${todayStr}.txt`);
      let lines: string[] = [];
      if (fs.existsSync(logFilePath)) {
        lines = fs.readFileSync(logFilePath, "utf8").split("\n").filter(Boolean);
      } else {
        lines = Logger.logHistory.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`);
      }

      const filteredLines = lines.filter((line) => {
        const match = line.match(/^\[([^\]]+)\]/);
        if (match) {
          const time = new Date(match[1]).getTime();
          return !isNaN(time) && time >= cutoffMs;
        }
        return false;
      });

      const logSample = filteredLines.slice(-150).join("\n");
      if (!logSample) {
        return res.json({
          summary: {
            performance: "Belum ada log aktivitas untuk periode ini.",
            bannedAccounts: [],
            insights: "Tidak ada data.",
            aiUnderstanding: "Tidak ada data.",
          },
        });
      }

      const summary = await AIService.generateLogSummary(logSample, aiConfig.apiKeys);
      res.json({ summary });
    } catch (e: any) {
      res.status(500).json({ error: `Gagal menganalisis log: ${e.message}` });
    }
  });

  // DELETE /api/logs/clear
  router.delete("/clear", (_req, res) => {
    try {
      Logger.logHistory = [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayLogFile = path.join(LOGS_DIR, `logs-${todayStr}.txt`);
      if (fs.existsSync(todayLogFile)) {
        fs.writeFileSync(todayLogFile, "");
      }
      deps.broadcastLog("Console log berhasil dibersihkan.", "info");
      res.json({ success: true, message: "Log berhasil dibersihkan" });
    } catch (err: any) {
      res.status(500).json({ error: `Gagal membersihkan log: ${err.message}` });
    }
  });

  // DELETE /api/logs/clear-all → HAPUS RIIL SELURUH FILE LOG DI DISK
  router.delete("/clear-all", (_req, res) => {
    try {
      Logger.logHistory = [];
      let deletedCount = 0;
      let freedBytes = 0;

      if (fs.existsSync(LOGS_DIR)) {
        const files = fs.readdirSync(LOGS_DIR);
        for (const file of files) {
          if (file.startsWith("logs-") && file.endsWith(".txt")) {
            const fp = path.join(LOGS_DIR, file);
            try {
              const stat = fs.statSync(fp);
              freedBytes += stat.size;
              fs.unlinkSync(fp);
              deletedCount++;
            } catch (err) {}
          }
        }
      }

      // Buat file baru yang bersih dan kosong untuk hari ini
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayLogFile = path.join(LOGS_DIR, `logs-${todayStr}.txt`);
      fs.writeFileSync(todayLogFile, "");

      const freedMb = (freedBytes / 1024 / 1024).toFixed(2);
      deps.broadcastLog(`[SISTEM] Seluruh arsip log fisik telah dihapus permanen (${deletedCount} file, ${freedMb} MB dibebaskan).`, "info");

      res.json({
        success: true,
        message: `Seluruh arsip log fisik telah dihapus permanen dari disk (${deletedCount} file, ${freedMb} MB dibebaskan).`,
        deletedCount,
        freedBytes,
      });
    } catch (err: any) {
      res.status(500).json({ error: `Gagal menghapus seluruh arsip log fisik: ${err.message}` });
    }
  });

  // DELETE /api/logs/date/:date
  router.delete("/date/:date", (req, res) => {
    const dateStr = String(req.params.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "Format tanggal tidak valid (YYYY-MM-DD)" });
    }
    const logFilePath = path.join(LOGS_DIR, `logs-${dateStr}.txt`);
    try {
      if (fs.existsSync(logFilePath)) {
        fs.unlinkSync(logFilePath);
      }
      res.json({ success: true, message: `File log tanggal ${dateStr} berhasil dihapus.` });
    } catch (err: any) {
      res.status(500).json({ error: `Gagal menghapus file log: ${err.message}` });
    }
  });

  // POST /api/logs/delete-entries
  router.post("/delete-entries", (req, res) => {
    const { date, timestamps } = req.body;
    if (!Array.isArray(timestamps) || timestamps.length === 0) {
      return res.status(400).json({ error: "Timestamps array wajib diisi" });
    }

    const tsSet = new Set(timestamps.map(String));

    try {
      Logger.logHistory = Logger.logHistory.filter((l) => !tsSet.has(l.timestamp));

      const dateStr = date && date !== "today" ? String(date).trim() : new Date().toISOString().slice(0, 10);
      const logFilePath = path.join(LOGS_DIR, `logs-${dateStr}.txt`);

      if (fs.existsSync(logFilePath)) {
        const lines = fs.readFileSync(logFilePath, "utf8").split("\n");
        const filteredLines = lines.filter((line) => {
          const match = line.match(/^\[([^\]]+)\]/);
          if (match && tsSet.has(match[1])) return false;
          return true;
        });
        fs.writeFileSync(logFilePath, filteredLines.join("\n"));
      }

      res.json({ success: true, message: `${timestamps.length} log berhasil dihapus.` });
    } catch (err: any) {
      res.status(500).json({ error: `Gagal menghapus log terpilih: ${err.message}` });
    }
  });

  // PUT /api/logs/edit
  router.put("/edit", (req, res) => {
    const { date, timestamp, newType, newMessage } = req.body;
    if (!timestamp || typeof newMessage !== "string") {
      return res.status(400).json({ error: "timestamp dan newMessage wajib diisi" });
    }

    try {
      const typeStr = (newType || "info").toLowerCase();
      const idx = Logger.logHistory.findIndex((l) => l.timestamp === timestamp);
      if (idx !== -1) {
        Logger.logHistory[idx] = {
          ...Logger.logHistory[idx],
          type: typeStr as any,
          message: newMessage,
        };
      }

      const dateStr = date && date !== "today" ? String(date).trim() : new Date().toISOString().slice(0, 10);
      const logFilePath = path.join(LOGS_DIR, `logs-${dateStr}.txt`);
      if (fs.existsSync(logFilePath)) {
        const lines = fs.readFileSync(logFilePath, "utf8").split("\n");
        const updated = lines.map((line) => {
          const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
          if (match && match[1] === timestamp) {
            return `[${timestamp}] [${typeStr.toUpperCase()}] ${newMessage}`;
          }
          return line;
        });
        fs.writeFileSync(logFilePath, updated.join("\n"));
      }

      res.json({ success: true, message: "Log berhasil diperbarui" });
    } catch (err: any) {
      res.status(500).json({ error: `Gagal mengedit log: ${err.message}` });
    }
  });

  return router;
}
