import React from "react";
import {
  Target,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Hash,
  BarChart2,
  Zap,
  Trash2,
} from "lucide-react";
import { ResolvedTarget, HealthInfo } from "../types";

export interface TargetGroupsSectionProps {
  targetGroups: string[];
  targetInput: string;
  setTargetInput: (val: string) => void;
  resolving: boolean;
  resolved: ResolvedTarget | null;
  setResolved: (val: ResolvedTarget | null) => void;
  resolveError: string;
  setResolveError: (val: string) => void;
  isSaving: boolean;
  isConnected: boolean;
  accountId: string | undefined;
  healthInfo: HealthInfo | null;
  pingingGroup: Record<string, boolean>;
  resolveTarget: () => void;
  confirmAddTarget: () => void;
  removeTarget: (t: string) => void;
  testPingGroup: (t: string) => void;
  onOpenGroupDetail: (t: string) => void;
}

export function TargetGroupsSection({
  targetGroups,
  targetInput,
  setTargetInput,
  resolving,
  resolved,
  setResolved,
  resolveError,
  setResolveError,
  isSaving,
  isConnected,
  accountId,
  healthInfo,
  pingingGroup,
  resolveTarget,
  confirmAddTarget,
  removeTarget,
  testPingGroup,
  onOpenGroupDetail,
}: TargetGroupsSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme">
        <Target size={15} className="text-accent" />
        <h3 className="text-sm font-bold text-1">Target Groups</h3>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium bg-[rgba(var(--accent-rgb),0.08)] text-accent-bright">
          {(targetGroups || []).length}
        </span>
      </div>

      <div className="p-4 sm:p-5 space-y-3 flex-1">
        <div className="flex gap-2">
          <input
            value={targetInput}
            onChange={(e) => {
              setTargetInput(e.target.value);
              setResolved(null);
              setResolveError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") resolveTarget();
            }}
            placeholder="@username atau -100123456789"
            className="input-cyber flex-1 h-10 sm:h-9 px-3"
          />
          <button
            onClick={resolveTarget}
            disabled={!targetInput.trim() || resolving || !isConnected}
            title={!isConnected ? "Akun harus terkoneksi" : "Cek target"}
            className="btn-ghost w-10 sm:w-9 h-10 sm:h-9 flex items-center justify-center disabled:opacity-40 transition shrink-0"
          >
            {resolving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
          </button>
        </div>

        {!isConnected && (
          <p className="text-[11px] px-3 py-2 text-[#fbbf24] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] rounded-lg">
            Akun offline — verifikasi target tidak tersedia.
          </p>
        )}

        {resolved && (
          <div className="p-3 bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.2)] rounded-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <CheckCircle2
                  size={14}
                  className="mt-0.5 shrink-0 text-[#34d399]"
                />
                <div>
                  <p className="text-xs font-bold text-[#34d399]">
                    {resolved.title}
                  </p>
                  <p className="text-[11px] mt-0.5 text-[rgba(52,211,153,0.7)]">
                    {resolved.id}
                    {resolved.type ? ` · ${resolved.type}` : ""}
                    {resolved.username ? ` · @${resolved.username}` : ""}
                    {resolved.membersCount
                      ? ` · ${resolved.membersCount.toLocaleString()} anggota`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={confirmAddTarget}
                disabled={isSaving}
                className="btn-accent px-3 py-1 text-xs font-semibold shrink-0 disabled:opacity-60"
              >
                + Tambah
              </button>
            </div>
          </div>
        )}

        {resolveError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(244,63,94,0.08)] border border-[rgba(244,63,94,0.15)] rounded-lg">
            <AlertCircle size={12} className="shrink-0 text-[#f43f5e]" />
            <p className="text-xs text-[#fb7185]">{resolveError}</p>
          </div>
        )}

        {!resolved &&
          !resolveError &&
          targetInput.trim() &&
          !resolving && (
            <button
              onClick={confirmAddTarget}
              disabled={isSaving}
              className="btn-ghost w-full h-9 text-xs transition disabled:opacity-50 border-dashed"
            >
              Tambah "{targetInput.trim()}" tanpa verifikasi
            </button>
          )}

        <div className="space-y-1.5 mt-1">
          {(targetGroups || []).map((t) => {
            const diag = healthInfo?.targetDiagnostics?.find((d: any) => d.target === t);
            const sentCount = (accountId && healthInfo?.groupStatsToday?.[t]?.byAccount?.[accountId]) || 0;
            return (
              <div
                key={t}
                className="flex flex-col p-3 bg-card-hover border border-theme rounded-xl space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Hash size={12} className="text-3 shrink-0" />
                    <span className="text-xs font-mono truncate text-1">
                      {t}
                    </span>
                    {sentCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(16,185,129,0.1)] text-[#34d399] border border-[rgba(16,185,129,0.15)] font-semibold">
                        {sentCount} terkirim
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {/* Detail Stats Button */}
                    <button
                      onClick={() => onOpenGroupDetail(t)}
                      className="text-3 hover:text-accent transition p-1 hover:bg-card rounded"
                      title="Lihat statistik detail grup ini"
                    >
                      <BarChart2 size={12} className="text-accent/70" />
                    </button>
                    <button
                      onClick={() => testPingGroup(t)}
                      disabled={pingingGroup[t] || !isConnected}
                      className="text-3 hover:text-accent disabled:opacity-40 transition p-1 hover:bg-card rounded"
                      title="Kirim diagnostic ping ke grup ini"
                    >
                      {pingingGroup[t] ? (
                        <Loader2 size={12} className="animate-spin text-accent" />
                      ) : (
                        <Zap size={12} className="text-accent" />
                      )}
                    </button>
                    <button
                      onClick={() => removeTarget(t)}
                      disabled={isSaving}
                      className="transition disabled:opacity-50 text-3 hover:text-[#f43f5e] p-1 hover:bg-card rounded"
                      title="Hapus Target"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Diagnostic details if loaded */}
                {diag && (
                  <div className="flex items-start gap-1.5 text-[10px] pt-1 border-t border-theme border-dashed">
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                        diag.status === "healthy" ? "bg-[#10b981]" : "bg-[#f43f5e]"
                      }`}
                    />
                    <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 justify-between">
                      <span className="text-2 font-medium truncate">
                        {diag.title} ({diag.type})
                      </span>
                      {diag.status === "healthy" && (
                        <span className="text-[9px] text-[#34d399] font-medium bg-[#10b981]/10 px-1 rounded">OK</span>
                      )}
                    </div>
                  </div>
                )}
                {diag && diag.error && (
                  <p className="text-[#fb7185] text-[9px] leading-normal mt-0.5 pl-3">{diag.error}</p>
                )}
              </div>
            );
          })}
          {(targetGroups || []).length === 0 && (
            <p className="text-xs text-center py-5 italic text-3">
              Belum ada target grup
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default TargetGroupsSection;
