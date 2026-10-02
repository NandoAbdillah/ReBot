import React from "react";
import { BarChart2, X } from "lucide-react";
import { HealthInfo } from "../types";

export interface GroupDetailModalProps {
  targetId: string | null;
  healthInfo: HealthInfo | null;
  onClose: () => void;
}

export function GroupDetailModal({
  targetId,
  healthInfo,
  onClose,
}: GroupDetailModalProps) {
  if (!targetId) return null;

  const groupStat = healthInfo?.groupStatsToday?.[targetId] || { total: 0, byAccount: {} };
  const byAccountList = Object.entries(groupStat.byAccount || {});
  const totalSent = groupStat.total || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="cyber-modal max-w-md w-full bg-card border border-theme rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-theme flex items-center justify-between bg-[rgba(var(--accent-rgb),0.03)]">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-accent" />
            <h3 className="text-sm font-bold text-1">Detail Statistik Grup</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-3 hover:text-1 transition p-1 hover:bg-card-hover rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex-1 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs text-3 uppercase font-semibold">Target Grup / Channel ID</p>
            <p className="text-sm font-mono text-1 mt-0.5">{targetId}</p>
          </div>

          <div className="p-4 rounded-xl bg-card-hover border border-theme flex flex-col items-center justify-center text-center">
            <p className="text-[11px] text-3 font-semibold uppercase tracking-wider">Total Terkirim Hari Ini</p>
            <p className="text-3xl font-extrabold text-accent mt-1">{totalSent}</p>
            <p className="text-[10px] text-3 mt-1.5 italic">Reset otomatis setiap hari pukul 00:00 WIB</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-2 uppercase tracking-wide mb-3">Kontribusi per Akun</h4>
            {byAccountList.length > 0 ? (
              <div className="space-y-3.5">
                {byAccountList.map(([accId, count]) => {
                  const countNum = Number(count);
                  const pct = totalSent > 0 ? (countNum / totalSent) * 100 : 0;
                  return (
                    <div key={accId} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-1 font-mono">{accId}</span>
                        <span className="text-2 font-semibold">{countNum} pesan ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-theme/45 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: "var(--accent-gradient)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-center py-5 italic text-3">Belum ada aktivitas pengiriman hari ini</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default GroupDetailModal;
