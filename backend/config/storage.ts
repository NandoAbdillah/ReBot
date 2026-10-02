// backend/config/storage.ts
import "dotenv/config";
import fs from "fs";
import path from "path";

// Deteksi environment & Railway Volume fallback
export const DATA_DIR =
  process.env.DATA_DIR || (fs.existsSync(path.join(process.cwd(), "data")) ? path.join(process.cwd(), "data") : ".");

// Pastikan direktori volume eksis sebelum sistem mencoba menulis data
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[SYSTEM] Initialized storage volume at: ${DATA_DIR}`);
}

// Sentralisasi path database JSON
export const DB_PATHS = {
  ACCOUNTS: path.join(DATA_DIR, "accounts.json"),
  SETTINGS: path.join(DATA_DIR, "settings.json"),
  ACCOUNT_SETTINGS: path.join(DATA_DIR, "account_settings.json"),
  STATS: path.join(DATA_DIR, "stats.json"),
  AI_CONFIG: path.join(DATA_DIR, "ai_config.json"),
  BACKUP_DIR: path.join(DATA_DIR, "backups"),
};

if (!fs.existsSync(DB_PATHS.BACKUP_DIR)) {
  fs.mkdirSync(DB_PATHS.BACKUP_DIR, { recursive: true });
}

export const MEDIA_DIR = path.join(DATA_DIR, "media");
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  console.log(`[SYSTEM] Initialized media storage directory at: ${MEDIA_DIR}`);
}

export const LOGS_DIR = path.join(DATA_DIR, "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log(`[SYSTEM] Initialized logs directory at: ${LOGS_DIR}`);
}

export const PORT = process.env.PORT || 3000;