import { useState, useEffect, useCallback } from "react";
import { StatsData } from "../types";

export function useStats(isAuthed: boolean) {
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [statsAccountFilter, setStatsAccountFilter] = useState<string>("all");

  const loadStats = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const params = new URLSearchParams({ days: "7" });
      if (statsAccountFilter !== "all") {
        params.set("account", statsAccountFilter);
      }
      const data = await fetch(`/api/stats?${params}`).then((r) => r.json());
      setStatsData(data);
    } catch {}
  }, [isAuthed, statsAccountFilter]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats]);

  return {
    statsData,
    setStatsData,
    statsAccountFilter,
    setStatsAccountFilter,
    loadStats,
  };
}
