import React from "react";
import { Send, Plus, Pencil, Trash2 } from "lucide-react";
import { BroadcastJob } from "../types";

export interface AutoBroadcasterSectionProps {
  broadcastJobs: BroadcastJob[];
  togglingJob: string | null;
  toggleBroadcastJob: (id: string) => void;
  deleteBroadcastJob: (id: string) => void;
  onAddJob: () => void;
  onEditJob: (job: BroadcastJob) => void;
}

export function AutoBroadcasterSection({
  broadcastJobs,
  togglingJob,
  toggleBroadcastJob,
  deleteBroadcastJob,
  onAddJob,
  onEditJob,
}: AutoBroadcasterSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col lg:col-span-2">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between border-b border-theme bg-[rgba(var(--accent-rgb),0.03)]">
        <div className="flex items-center gap-2">
          <Send size={15} className="text-accent" />
          <h3 className="text-sm font-bold text-1">Auto Broadcaster</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[rgba(var(--accent-rgb),0.08)] text-accent-bright">
            {(broadcastJobs || []).length} Job
          </span>
        </div>
        <button
          type="button"
          onClick={onAddJob}
          className="btn-accent h-7 px-3 text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus size={12} /> Tambah Job
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-xs mb-4 leading-relaxed text-2">
          Kirim pesan secara otomatis dan berkala ke grup target tanpa trigger keyword. Jeda acak membantu menghindari deteksi spam dari Telegram.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(broadcastJobs || []).map((job) => {
            const isToggling = togglingJob === job.id;
            return (
              <div
                key={job.id}
                className="p-4 bg-card-hover border border-theme rounded-xl flex flex-col justify-between space-y-3 group hover:border-accent/30 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-1 truncate max-w-[180px]">{job.name}</h4>
                    <div className="flex items-center gap-2">
                      {/* Toggle switch */}
                      <button
                        type="button"
                        onClick={() => toggleBroadcastJob(job.id)}
                        disabled={isToggling}
                        className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${
                          job.isActive ? "bg-[rgba(var(--accent-rgb),0.8)]" : "bg-theme"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all`}
                          style={{ left: job.isActive ? "16px" : "2px" }}
                        />
                      </button>
                      {/* Edit/Delete Actions */}
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditJob(job)}
                          className="p-1 text-3 hover:text-accent rounded transition"
                          title="Edit job"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBroadcastJob(job.id)}
                          className="p-1 text-3 hover:text-[#f43f5e] rounded transition"
                          title="Hapus job"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-accent truncate">{job.targetGroup}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] text-3">
                    <span>Jeda:</span>
                    <span className="font-semibold text-2">
                      {job.intervalMin === job.intervalMax
                        ? `${job.intervalMin}s`
                        : `${job.intervalMin}s – ${job.intervalMax}s`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-3">
                    <span>Konten:</span>
                    <span className="font-semibold text-2">
                      {job.items.length} pesan
                    </span>
                  </div>
                  {job.keywords && job.keywords.length > 0 && (
                    <div className="flex justify-between items-start text-[10px] text-3">
                      <span className="shrink-0 mt-0.5">Trigger:</span>
                      <div className="flex flex-wrap gap-1 justify-end max-w-[75%]">
                        {job.keywords.map((kw) => (
                          <span key={kw} className="px-1.5 py-0.2 bg-[rgba(var(--accent-rgb),0.08)] border border-accent/15 text-accent-bright font-mono text-[9px] rounded">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Items previews list */}
                <div className="border-t border-theme/50 pt-2 space-y-1">
                  {job.items.slice(0, 2).map((item, idx) => (
                    <div key={idx} className="text-[10px] text-3 truncate flex items-center gap-1">
                      <span className="text-accent">•</span>
                      <span>{item.text || `[Media: ${item.media?.length || 0} file]`}</span>
                    </div>
                  ))}
                  {job.items.length > 2 && (
                    <p className="text-[9px] text-3 italic pl-2">+ {job.items.length - 2} item lainnya</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {(broadcastJobs || []).length === 0 && (
          <div className="text-center py-8 bg-card rounded-xl border border-dashed border-accent/20">
            <Send size={24} className="mx-auto mb-2 text-3 opacity-30" />
            <p className="text-xs italic text-3">Belum ada broadcast job aktif</p>
            <button
              type="button"
              onClick={onAddJob}
              className="mt-2.5 btn-ghost px-4 py-2 text-xs border-dashed"
            >
              + Buat job pertama
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
export default AutoBroadcasterSection;
