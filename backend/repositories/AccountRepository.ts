// backend/repositories/AccountRepository.ts
import fs from "fs";
import { DB_PATHS } from "../config/storage.js";

export interface AccountRecord {
  accountId: string;
  apiId: number;
  apiHash: string;
  sessionString: string;
}

export class AccountRepository {
  private static accounts: AccountRecord[] = [];
  private static isLoaded = false;

  public static load(): AccountRecord[] {
    if (this.isLoaded) return this.accounts;
    if (!fs.existsSync(DB_PATHS.ACCOUNTS)) {
      this.accounts = [];
      this.isLoaded = true;
      return this.accounts;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(DB_PATHS.ACCOUNTS, "utf8"));
      if (!Array.isArray(raw)) return [];
      this.accounts = raw
        .filter((item) => item?.accountId && item?.apiId && item?.apiHash && item?.sessionString)
        .map((item) => ({
          accountId: String(item.accountId),
          apiId: Number(item.apiId),
          apiHash: String(item.apiHash),
          sessionString: String(item.sessionString),
        }));
      this.isLoaded = true;
    } catch (e) {
      console.error("[DB] Gagal memuat accounts.json:", e);
      this.accounts = [];
    }
    return this.accounts;
  }

  public static getAll(): AccountRecord[] {
    return this.load();
  }

  public static getById(accountId: string): AccountRecord | undefined {
    return this.load().find((a) => a.accountId === accountId);
  }

  public static upsert(record: AccountRecord): void {
    const list = this.load();
    const idx = list.findIndex((a) => a.accountId === record.accountId);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    this.save();
  }

  public static remove(accountId: string): void {
    const list = this.load();
    const idx = list.findIndex((a) => a.accountId === accountId);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.save();
    }
  }

  public static save(): void {
    fs.writeFileSync(DB_PATHS.ACCOUNTS, JSON.stringify(this.accounts, null, 2));
  }

  public static reload(): void {
    this.isLoaded = false;
    this.load();
  }
}