import React from "react";
import { BarChart2, X } from "lucide-react";
import { ResponseRule, HealthInfo } from "../types";

export interface KeywordDetailModalProps {
  rule: ResponseRule | null;
  accountId: string | undefined;
  healthInfo: HealthInfo | null;
  onClose: () => void;
}

export function KeywordDetailModal({
  rule,
  accountId,
  healthInfo,
  onClose,
}: KeywordDetailModalProps) {
  if (!rule) return null;

  const kwStats = healthInfo?.keywordStats || {};

  // Aggregate stats for all keywords in this rule
  const aggregatedByAccount: Record<string, number> = {};
  const aggregatedByGroup: Record<string, number> = {};
  let totalSent = 0;
  let accountSent = 0;

  rule.keywords.forEach((kw) => {
    const stat = kwStats[kw] || { total: 0, byAccount: {}, byGroup: {} };
    totalSent += stat.total || 0;

    if (accountId && stat.byAccount?.[accountId]) {
      accountSent += stat.byAccount[accountId];
    }

    Object.entries(stat.byAccount || {}).forEach(([accId, val]) => {
      aggregatedByAccount[accId] = (aggregatedByAccount[accId] || 0) + (val as number);
    });

    Object.entries(stat.byGroup || {}).forEach(([gId, val]) => {
      aggregatedByGroup[gId] = (aggregatedByGroup[gId] || 0) + (val as number);
    });
  });

  const byAccountList = Object.entries(aggregatedByAccount);
  const byGroupList = Object.entries(aggregatedByGroup);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="cyber-modal max-w-lg w-full bg-card border border-theme rounded-xl overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-theme flex items-center justify-between bg-[rgba(var(--accent-rgb),0.03)]">
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-accent" />
            <h3 className="text-sm font-bold text-1">Detail Statistik Keyword</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-3 hover:text-1 transition p-1 hover:bg-card-hover rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex-1 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs text-3 uppercase font-semibold">Keywords</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {rule.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(var(--accent-rgb),0.1)] text-accent-bright border border-accent/20 font-mono"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5 mb-2">
            <div className="p-3 rounded-xl bg-card-hover border border-theme flex flex-col items-center justify-center text-center">
              <p className="text-[10px] text-3 font-semibold uppercase tracking-wider">Terkirim (Akun Ini)</p>
              <p className="text-2xl font-extrabold text-accent mt-0.5">{accountSent}</p>
            </div>
            <div className="p-3 rounded-xl bg-card-hover border border-theme/50 flex flex-col items-center justify-center text-center">
              <p className="text-[10px] text-3 font-semibold uppercase tracking-wider">Total Semua Akun</p>
              <p className="text-2xl font-extrabold text-[#34d399] mt-0.5">{totalSent}</p>
            </div>
          </div>
          <p className="text-[10px] text-center text-3 italic mb-3">Reset otomatis setiap hari pukul 00:00 WIB</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Breakdown by Account */}
            <div>
              <h4 className="text-xs font-semibold text-2 uppercase tracking-wide mb-3">Kirim per Akun</h4>
              {byAccountList.length > 0 ? (
                <div className="space-y-3">
                  {byAccountList.map(([accId, count]) => {
                    const countNum = Number(count);
                    const pct = totalSent > 0 ? (countNum / totalSent) * 100 : 0;
                    return (
                      <div key={accId} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-1 font-mono truncate max-w-[120px]">{accId}</span>
                          <span className="text-2 font-semibold">{countNum}</span>
                        </div>
                        <div className="w-full h-1.5 bg-theme/45 rounded-full overflow-hidden">
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
                <p className="text-xs text-center py-5 italic text-3">Belum ada aktivitas</p>
              )}
            </div>

            {/* Breakdown by Group */}
            <div>
              <h4 className="text-xs font-semibold text-2 uppercase tracking-wide mb-3">Kirim per Grup</h4>
              {byGroupList.length > 0 ? (
                <div className="space-y-2 border border-theme/40 rounded-xl overflow-hidden bg-card-hover p-2 max-h-[200px] overflow-y-auto">
                  {byGroupList.map(([gId, count]) => (
                    <div key={gId} className="flex justify-between items-center py-1 px-2 hover:bg-card/40 rounded-lg text-xs">
                      <span className="text-2 font-mono truncate max-w-[150px]" title={gId}>{gId}</span>
                      <span className="text-1 font-bold bg-theme px-2 py-0.5 rounded border border-theme font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center py-5 italic text-3">Belum ada aktivitas</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default KeywordDetailModal;
