// backend/repositories/AiConfigRepository.ts
import fs from "fs";
import { DB_PATHS } from "../config/storage.js";

export interface KeyDetail {
  models: { [modelName: string]: number };
}

export interface DailyStat {
  totalRequests: number;
  totalLimitHits: number;
  byKey: { [keyName: string]: number };
}

export interface AIConfig {
  isActive: boolean;
  apiKeys: string[];
  stats: { requestsToday: number; limitHits: number };
  lastReset: string;
  dailyStats?: { [date: string]: DailyStat };
  keyDetails?: { [keyName: string]: KeyDetail };
  smartKeyEnabled?: boolean;
  smartKeyLimit?: number;
}

export class AiConfigRepository {
  private static config: AIConfig = {
    isActive: false,
    apiKeys: [],
    stats: { requestsToday: 0, limitHits: 0 },
    lastReset: new Date().toISOString().slice(0, 10),
    dailyStats: {},
    keyDetails: {},
    smartKeyEnabled: false,
    smartKeyLimit: 50,
  };
  private static isLoaded = false;

  private static getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public static load(): void {
    if (this.isLoaded) return;
    
    if (fs.existsSync(DB_PATHS.AI_CONFIG)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DB_PATHS.AI_CONFIG, "utf8"));
        this.config = { ...this.config, ...raw };
        
        // Ensure properties exist
        if (!this.config.dailyStats) this.config.dailyStats = {};
        if (!this.config.keyDetails) this.config.keyDetails = {};
        if (!this.config.stats) this.config.stats = { requestsToday: 0, limitHits: 0 };
        if (this.config.smartKeyEnabled === undefined) this.config.smartKeyEnabled = false;
        if (this.config.smartKeyLimit === undefined) this.config.smartKeyLimit = 50;
        
        // Riset statistik harian secara otomatis
        this.ensureTodayInit();
      } catch (e) {
        console.error("[DB] Gagal memuat ai_config.json:", e);
      }
    }
    this.isLoaded = true;
  }

  private static ensureTodayInit(): void {
    const today = this.getTodayKey();
    if (!this.config.dailyStats) this.config.dailyStats = {};
    if (!this.config.keyDetails) this.config.keyDetails = {};

    if (this.config.lastReset !== today) {
      this.config.stats.requestsToday = 0;
      this.config.stats.limitHits = 0;
      this.config.lastReset = today;
    }

    if (!this.config.dailyStats[today]) {
      this.config.dailyStats[today] = {
        totalRequests: 0,
        totalLimitHits: 0,
        byKey: {},
      };
      this.save();
    }
  }

  public static getConfig(): AIConfig {
    this.load();
    return this.config;
  }

  public static updateConfig(updates: Partial<AIConfig>): AIConfig {
    this.load();
    this.config = { ...this.config, ...updates };
    this.save();
    return this.config;
  }

  public static recordApiRequest(keyName: string = "Akun-AI", modelName: string = "Model-AI"): void {
    this.load();
    this.ensureTodayInit();
    
    const today = this.getTodayKey();
    
    this.config.stats.requestsToday++;
    
    if (this.config.dailyStats && this.config.dailyStats[today]) {
      const dayStat = this.config.dailyStats[today];
      dayStat.totalRequests++;
      dayStat.byKey[keyName] = (dayStat.byKey[keyName] || 0) + 1;
    }

    if (this.config.keyDetails) {
      if (!this.config.keyDetails[keyName]) {
        this.config.keyDetails[keyName] = { models: {} };
      }
      const keyDetail = this.config.keyDetails[keyName];
      keyDetail.models[modelName] = (keyDetail.models[modelName] || 0) + 1;
    }

    this.save();
  }

  public static recordLimitHit(keyName: string = "Akun-AI"): void {
    this.load();
    this.ensureTodayInit();
    
    const today = this.getTodayKey();
    
    this.config.stats.limitHits++;
    
    if (this.config.dailyStats && this.config.dailyStats[today]) {
      const dayStat = this.config.dailyStats[today];
      dayStat.totalLimitHits++;
    }

    this.save();
  }

  private static save(): void {
    fs.writeFileSync(DB_PATHS.AI_CONFIG, JSON.stringify(this.config, null, 2));
  }

  public static reload(): void {
    this.isLoaded = false;
    this.config = {
      isActive: false,
      apiKeys: [],
      stats: { requestsToday: 0, limitHits: 0 },
      lastReset: new Date().toISOString().slice(0, 10),
      dailyStats: {},
      keyDetails: {},
      smartKeyEnabled: false,
      smartKeyLimit: 50,
    };
    this.load();
  }
}