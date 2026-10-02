import React from "react";
import {
  MessageSquare,
  Plus,
  BarChart2,
  Pencil,
  Trash2,
  Upload,
  Send,
} from "lucide-react";
import { ResponseRule, HealthInfo } from "../types";

export interface AutoReplyRulesSectionProps {
  responses: ResponseRule[];
  isSaving: boolean;
  accountId: string | undefined;
  healthInfo: HealthInfo | null;
  onAddRule: () => void;
  onEditRule: (rule: ResponseRule) => void;
  onDeleteRule: (id: string) => void;
  onOpenKeywordDetail: (rule: ResponseRule) => void;
}

export function AutoReplyRulesSection({
  responses,
  isSaving,
  accountId,
  healthInfo,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onOpenKeywordDetail,
}: AutoReplyRulesSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between border-b border-theme">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-accent" />
          <h3 className="text-sm font-bold text-1">Auto Reply Rules</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[rgba(var(--accent-rgb),0.08)] text-accent-bright">
            {(responses || []).length}
          </span>
          <button
            onClick={onAddRule}
            className="btn-accent h-7 px-3 text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus size={12} /> Tambah
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 flex-1">
        <div className="space-y-2 max-h-[380px] overflow-y-auto scrollbar-thin">
          {(responses || []).map((rule) => (
            <div
              key={rule.id}
              className="p-3 bg-card-hover border border-theme rounded-xl group hover:border-accent/30 transition"
            >
              {/* Keywords row + actions */}
              <div className="flex items-start gap-2 mb-2.5">
                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                  {rule.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-[rgba(var(--accent-rgb),0.1)] text-accent-bright border border-accent/20 font-mono"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => onOpenKeywordDetail(rule)}
                    title="Detail statistik keyword ini"
                    className="p-1.5 text-3 hover:text-accent rounded-lg hover:bg-[rgba(var(--accent-rgb),0.1)] transition"
                  >
                    <BarChart2 size={12} />
                  </button>
                  <button
                    onClick={() => onEditRule(rule)}
                    title="Edit rule"
                    className="p-1.5 text-3 hover:text-accent rounded-lg hover:bg-[rgba(var(--accent-rgb),0.1)] transition"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => onDeleteRule(rule.id)}
                    disabled={isSaving}
                    title="Hapus rule"
                    className="p-1.5 text-3 hover:text-[#f43f5e] rounded-lg hover:bg-[rgba(244,63,94,0.1)] transition disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Replies preview */}
              <div className="space-y-2 pl-1">
                {rule.replies.map((reply, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[10px] text-accent/50 font-bold shrink-0 mt-0.5">
                        {i + 1}.
                      </span>
                      <p className="text-xs text-2 leading-relaxed line-clamp-1">
                        {reply.text || <span className="italic text-3">(Hanya media)</span>}
                      </p>
                    </div>
                    {reply.media && reply.media.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-4">
                        {reply.media.map((m, idx) => {
                          const isVideo = m.endsWith(".mp4") || m.endsWith(".webm") || m.endsWith(".mov");
                          return (
                            <div key={idx} className="w-6 h-6 rounded border border-theme/30 overflow-hidden bg-card-hover shrink-0 flex items-center justify-center">
                              {isVideo ? (
                                <video src={`/media/${m}`} className="w-full h-full object-cover" muted />
                              ) : (
                                <img src={`/media/${m}`} alt="thumb" className="w-full h-full object-cover" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Stats footer */}
              {(() => {
                const kwStats = healthInfo?.keywordStats || {};
                const totalSent = rule.keywords.reduce(
                  (sum: number, kw: string) => sum + ((accountId && kwStats[kw]?.byAccount?.[accountId]) || 0),
                  0
                );
                return (
                  <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-theme/50">
                    <span className="text-[10px] text-3 flex items-center gap-1">
                      <MessageSquare size={10} className="text-accent/50" />
                      {rule.replies.length} balasan beruntun
                    </span>
                    {(() => {
                      const totalMedia = rule.replies.reduce((sum, r) => sum + (r.media?.length || 0), 0);
                      return totalMedia > 0 ? (
                        <span className="text-[10px] text-3 flex items-center gap-1">
                          <Upload size={10} className="text-accent/50" />
                          {totalMedia} media
                        </span>
                      ) : null;
                    })()}
                    <span className="text-[10px] text-3">
                      {rule.keywords.length} keyword
                    </span>
                    {totalSent > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenKeywordDetail(rule)}
                        className="ml-auto text-[10px] flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(16,185,129,0.08)] text-[#34d399] border border-[rgba(16,185,129,0.12)] font-semibold hover:bg-[rgba(16,185,129,0.15)] transition cursor-pointer"
                        title="Klik untuk lihat detail statistik per-akun dan per-grup untuk keyword ini"
                      >
                        <Send size={9} />
                        <span>{totalSent} hari ini</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}

          {(responses || []).length === 0 && (
            <div className="text-center py-10">
              <MessageSquare
                size={28}
                className="mx-auto mb-3 text-3 opacity-30"
              />
              <p className="text-xs italic text-3">
                Belum ada rule balasan
              </p>
              <button
                onClick={onAddRule}
                className="mt-3 btn-ghost px-4 py-2 text-xs border-dashed"
              >
                + Tambah rule pertama
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default AutoReplyRulesSection;
