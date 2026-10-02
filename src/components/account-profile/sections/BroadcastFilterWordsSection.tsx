import React from "react";
import { ShieldAlert, Loader2, Plus, X } from "lucide-react";

export interface BroadcastFilterWordsSectionProps {
  broadcastFilterWordsEnabled: boolean;
  broadcastFilterWords: string[];
  broadcastFilterInput: string;
  setBroadcastFilterInput: (val: string) => void;
  isSaving: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onAddManual: () => void;
  onRemoveWord: (w: string) => void;
}

export function BroadcastFilterWordsSection({
  broadcastFilterWordsEnabled,
  broadcastFilterWords,
  broadcastFilterInput,
  setBroadcastFilterInput,
  isSaving,
  onToggleEnabled,
  onAddManual,
  onRemoveWord,
}: BroadcastFilterWordsSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme bg-[rgba(244,63,94,0.03)]">
        <ShieldAlert size={15} className="text-[#f43f5e]" />
        <h3 className="text-sm font-bold text-1">Broadcast Blocked Words</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold bg-[rgba(244,63,94,0.08)] ${
            broadcastFilterWordsEnabled ? "text-[#fb7185]" : "text-3"
          }`}
        >
          {(broadcastFilterWords || []).length} Kata
        </span>
        {/* Toggle */}
        <div
          className={`toggle-track ml-auto shrink-0 ${broadcastFilterWordsEnabled ? "active" : ""}`}
          style={{
            opacity: isSaving ? 0.6 : 1,
            ...(broadcastFilterWordsEnabled
              ? {
                  background: "#f43f5e",
                  boxShadow: "0 0 10px rgba(244,63,94,0.3)",
                }
              : {}),
          }}
          onClick={() => {
            if (!isSaving) onToggleEnabled(!broadcastFilterWordsEnabled);
          }}
        >
          <div className="toggle-thumb" />
        </div>
      </div>

      <div
        className={`p-4 sm:p-5 flex-1 transition-opacity ${
          broadcastFilterWordsEnabled
            ? ""
            : "opacity-40 pointer-events-none"
        }`}
      >
        <p className="text-xs mb-3 leading-relaxed text-2">
          Pesan broadcast (berkala & pemicu keyword) akan dilewati jika mendeteksi kata-kata berikut ini di grup target. Pisahkan dengan tanda koma.
        </p>

        {/* Input row */}
        <div className="flex gap-2 mb-3">
          <input
            value={broadcastFilterInput}
            onChange={(e) => setBroadcastFilterInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddManual();
            }}
            placeholder="Ketik kata terlarang broadcast…"
            className="input-cyber flex-1 h-9 px-3 text-xs"
          />
          {/* Manual add */}
          <button
            onClick={onAddManual}
            disabled={isSaving || !broadcastFilterInput.trim()}
            className="w-9 h-9 flex items-center justify-center disabled:opacity-40 transition shrink-0 bg-[rgba(244,63,94,0.08)] text-[#fb7185] border border-[rgba(244,63,94,0.15)] rounded-lg hover:bg-[rgba(244,63,94,0.15)]"
          >
            {isSaving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
          </button>
        </div>

        {/* Filter Word Chips */}
        <div className="flex flex-wrap gap-2">
          {(broadcastFilterWords || []).map((word) => (
            <span
              key={word}
              className="chip text-[#fb7185] bg-[rgba(244,63,94,0.08)] border-[rgba(244,63,94,0.15)] hover:bg-[rgba(244,63,94,0.12)] hover:border-[rgba(244,63,94,0.25)]"
            >
              {word}
              <button
                onClick={() => onRemoveWord(word)}
                disabled={isSaving}
                className="transition disabled:opacity-50 text-[rgba(244,63,94,0.5)] hover:text-[#f43f5e]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {(broadcastFilterWords || []).length === 0 && (
            <p className="text-xs text-center py-5 w-full italic text-3">
              Belum ada kata terlarang broadcast
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default BroadcastFilterWordsSection;
