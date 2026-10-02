// backend/utils/Logger.ts
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { LOGS_DIR } from "../config/storage.js";

export class Logger {
  private static io: Server | null = null;
  public static MAX_LOG_HISTORY = 300; // Increased to 300 for better dashboard history
  public static logHistory: { message: string; type: "info" | "success" | "error" | "bot" | "warning" | "ai"; timestamp: string }[] = [];

  public static init(ioInstance: Server) {
    this.io = ioInstance;
    this.loadTodayLogs();
  }

  private static loadTodayLogs() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const logFilePath = path.join(LOGS_DIR, `logs-${todayStr}.txt`);
      if (fs.existsSync(logFilePath)) {
        const lines = fs.readFileSync(logFilePath, "utf8").split("\n").filter(Boolean);
        const loaded: typeof Logger.logHistory = [];
        for (const line of lines) {
          const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/);
          if (match) {
            loaded.push({
              timestamp: match[1],
              type: match[2].toLowerCase() as any,
              message: match[3],
            });
          }
        }
        
        // Cap to max log history
        this.logHistory = loaded.slice(-this.MAX_LOG_HISTORY);
        console.log(`[Logger] Loaded ${this.logHistory.length} persistent logs for today.`);
      }
    } catch (e) {
      console.error("[Logger] Gagal memuat log persisten hari ini:", e);
    }
  }

  public static broadcastLog(message: string, type: "info" | "success" | "error" | "bot" | "warning" | "ai" = "info") {
    const timestamp = new Date().toISOString(); // UTC ISO format to support browser-side local time conversion
    const entry = { message, type, timestamp };
    
    // Add to in-memory history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.MAX_LOG_HISTORY) {
      this.logHistory.shift();
    }
    
    // Append to file logs-YYYY-MM-DD.txt
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const logFilePath = path.join(LOGS_DIR, `logs-${todayStr}.txt`);
      const logLine = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
      fs.appendFileSync(logFilePath, logLine, "utf8");
    } catch (e) {
      console.error("[Logger] Gagal menulis ke file log:", e);
    }

    if (this.io) {
      this.io.emit("bot-log", entry);
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}