/**
 * SocketService.ts
 * Mengelola instance Socket.IO, riwayat error log terperinci,
 * dan event realtime ke klien dashboard.
 */

import { Server } from "socket.io";
import { DetailedErrorLog } from "./TelegramErrors.js";
import { Logger } from "../utils/Logger.js";

export const nowWIB = () =>
  new Date().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour12: false,
  });

export class SocketService {
  private static io: Server | null = null;
  public static readonly MAX_ERROR_LOG_HISTORY = 300;
  public static readonly errorLogHistory: DetailedErrorLog[] = [];
  private static errorLogSeq = 0;

  public static init(ioInstance: Server) {
    this.io = ioInstance;

    this.io.on("connection", (socket) => {
      // Kirim snapshot log persisten & error log saat browser terkoneksi
      for (const entry of Logger.logHistory) socket.emit("bot-log", entry);
      for (const entry of this.errorLogHistory) socket.emit("error-log", entry);

      socket.emit("bot-log", {
        message: `Dashboard tersambung. ${Logger.logHistory.length} log dimuat, ${this.errorLogHistory.length} error log cached.`,
        type: "info",
        timestamp: new Date().toISOString(),
      });
    });
  }

  public static getIO(): Server | null {
    return this.io;
  }

  public static pushErrorLog(
    entry: Omit<DetailedErrorLog, "id" | "timestamp" | "timeWIB">,
  ): DetailedErrorLog {
    const full: DetailedErrorLog = {
      id: `${Date.now()}-${this.errorLogSeq++}`,
      timestamp: new Date().toISOString(),
      timeWIB: nowWIB(),
      ...entry,
    };

    this.errorLogHistory.push(full);
    if (this.errorLogHistory.length > this.MAX_ERROR_LOG_HISTORY) {
      this.errorLogHistory.shift();
    }

    if (this.io) {
      this.io.emit("error-log", full);
    }
    return full;
  }

  public static emitFloodWait(data: {
    accountId: string;
    seconds: number;
    until: number;
    action: string;
  }) {
    if (this.io) {
      this.io.emit("flood-wait", data);
    }
  }

  public static emitAccountDisconnect(accountId: string) {
    if (this.io) {
      this.io.emit("account-disconnect", { accountId });
    }
  }
}
