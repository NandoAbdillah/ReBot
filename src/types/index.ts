// src/types/index.ts

export interface Log {
  message: string;
  type: string;
  timestamp: string;
}

export interface AccountStatus {
  accountId: string;
  connected: boolean;
  hasSession: boolean;
  isActive: boolean;
}

export interface DailyStatEntry {
  date: string;
  success: number;
  failed: number;
}

export interface FunnelStats {
  messagesHeard: number;
  keywordMatches: number;
  blockedFilterWords: number;
  blockedReasons?: Record<string, number>;
  skippedPostFilter: number;
  deliveryFailed?: number;
  slowmodeDelayed: number;
  floodWaitCount: number;
  triggerSuccess?: number;
  broadcastSuccess?: number;
}

export interface SmartAdvice {
  title: string;
  type: "info" | "warning" | "success" | "tip";
  message: string;
}

export interface StatsData {
  daily: DailyStatEntry[];
  today: {
    success: number;
    triggerSuccess?: number;
    broadcastSuccess?: number;
    failed: number;
  };
  totalSuccess: number;
  totalFailed: number;
  accounts?: string[];
  funnelToday?: FunnelStats;
  smartAdvice?: SmartAdvice[];
}

export interface FloodAlert {
  accountId: string;
  seconds: number;
  until: number;
}