import React from "react";
import { ShieldAlert, Sparkles, Loader2, Plus, Check, X } from "lucide-react";

export interface FilterWordsSectionProps {
  filterWordsEnabled: boolean;
  filterWords: string[];
  filterInput: string;
  setFilterInput: (val: string) => void;
  filterAiLoading: boolean;
  filterAiSuggestions: string[];
  filterSelected: Set<string>;
  isSaving: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onAddManual: () => void;
  onGenerateVariants: () => void;
  onToggleSuggestion: (w: string) => void;
  onAddSelected: () => void;
  onCloseSuggestions: () => void;
  onRemoveWord: (w: string) => void;
}

export function FilterWordsSection({
  filterWordsEnabled,
  filterWords,
  filterInput,
  setFilterInput,
  filterAiLoading,
  filterAiSuggestions,
  filterSelected,
  isSaving,
  onToggleEnabled,
  onAddManual,
  onGenerateVariants,
  onToggleSuggestion,
  onAddSelected,
  onCloseSuggestions,
  onRemoveWord,
}: FilterWordsSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme bg-[rgba(244,63,94,0.03)]">
        <ShieldAlert size={15} className="text-[#f43f5e]" />
        <h3 className="text-sm font-bold text-1">Filter Words</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold bg-[rgba(244,63,94,0.08)] ${
            filterWordsEnabled ? "text-[#fb7185]" : "text-3"
          }`}
        >
          {(filterWords || []).length} Kata
        </span>
        {/* Toggle */}
        <div
          className={`toggle-track ml-auto shrink-0 ${filterWordsEnabled ? "active" : ""}`}
          style={{
            opacity: isSaving ? 0.6 : 1,
            ...(filterWordsEnabled
              ? {
                  background: "#f43f5e",
                  boxShadow: "0 0 10px rgba(244,63,94,0.3)",
                }
              : {}),
          }}
          onClick={() => {
            if (!isSaving) onToggleEnabled(!filterWordsEnabled);
          }}
        >
          <div className="toggle-thumb" />
        </div>
      </div>

      <div
        className={`p-4 sm:p-5 flex-1 transition-opacity ${
          filterWordsEnabled
            ? ""
            : "opacity-40 pointer-events-none"
        }`}
      >
        <p className="text-xs mb-3 leading-relaxed text-2">
          Bot otomatis diam jika mendeteksi kata di bawah ini. Gunakan{" "}
          <Sparkles size={11} className="inline text-[#fb7185] -mt-0.5" />{" "}
          AI untuk auto-generate varian ejaan & typo dari satu kata.
        </p>

        {/* Input row */}
        <div className="flex gap-2 mb-3">
          <input
            value={filterInput}
            onChange={(e) => {
              setFilterInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddManual();
            }}
            placeholder="Ketik kata terlarang…"
            className="input-cyber flex-1 h-9 px-3 text-xs"
          />
          {/* AI button */}
          <button
            onClick={onGenerateVariants}
            disabled={filterAiLoading || !filterInput.trim()}
            title="AI: Generate varian ejaan & typo"
            className="btn-ghost w-9 h-9 flex items-center justify-center shrink-0 border border-[rgba(244,63,94,0.2)] hover:border-[rgba(244,63,94,0.5)] disabled:opacity-40"
          >
            {filterAiLoading ? (
              <Loader2
                size={13}
                className="animate-spin text-[#fb7185]"
              />
            ) : (
              <Sparkles size={13} className="text-[#fb7185]" />
            )}
          </button>
          {/* Manual add */}
          <button
            onClick={onAddManual}
            disabled={isSaving || !filterInput.trim()}
            className="w-9 h-9 flex items-center justify-center disabled:opacity-40 transition shrink-0 bg-[rgba(244,63,94,0.08)] text-[#fb7185] border border-[rgba(244,63,94,0.15)] rounded-lg hover:bg-[rgba(244,63,94,0.15)]"
          >
            {isSaving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
          </button>
        </div>

        {/* AI Suggestions Panel */}
        {filterAiSuggestions.length > 0 && (
          <div className="mb-3 p-3 bg-[rgba(244,63,94,0.04)] border border-[rgba(244,63,94,0.15)] rounded-xl">
            <p className="text-xs font-semibold text-[#fb7185] mb-2.5 flex items-center gap-1.5">
              <Sparkles size={11} />
              Saran AI — klik untuk pilih varian:
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {filterAiSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => onToggleSuggestion(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-mono transition ${
                    filterSelected.has(s)
                      ? "bg-[rgba(244,63,94,0.15)] border-[rgba(244,63,94,0.5)] text-[#f43f5e] font-semibold"
                      : "bg-card-hover border-theme text-2 hover:border-[rgba(244,63,94,0.3)]"
                  }`}
                >
                  {filterSelected.has(s) && (
                    <Check size={10} className="inline mr-1" />
                  )}
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onAddSelected}
                disabled={filterSelected.size === 0}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[rgba(244,63,94,0.12)] text-[#fb7185] border border-[rgba(244,63,94,0.2)] hover:bg-[rgba(244,63,94,0.2)] disabled:opacity-40 transition"
              >
                + Tambah ({filterSelected.size})
              </button>
              <button
                onClick={onCloseSuggestions}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Filter Word Chips */}
        <div className="flex flex-wrap gap-2">
          {(filterWords || []).map((word) => (
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
          {(filterWords || []).length === 0 && (
            <p className="text-xs text-center py-5 w-full italic text-3">
              Belum ada kata terlarang
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default FilterWordsSection;
