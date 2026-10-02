import React, { useRef, useState } from "react";
import { BrainCircuit, Loader2, Check } from "lucide-react";
import { DEFAULT_AI_PROMPT } from "../types";

export interface AiPromptSectionProps {
  aiPromptText: string;
  setAiPromptText: (val: string) => void;
  aiPromptSaving: boolean;
  aiPromptSaved: boolean;
  saveAiPrompt: (text: string) => void;
}

export function AiPromptSection({
  aiPromptText,
  setAiPromptText,
  aiPromptSaving,
  aiPromptSaved,
  saveAiPrompt,
}: AiPromptSectionProps) {
  const [atSuggestionOpen, setAtSuggestionOpen] = useState(false);
  const aiPromptRef = useRef<HTMLTextAreaElement>(null);

  const handleAiPromptChange = (text: string) => {
    setAiPromptText(text);
    const textarea = aiPromptRef.current;
    if (textarea) {
      const cursor = textarea.selectionStart;
      const textBeforeCursor = text.slice(0, cursor);
      if (textBeforeCursor.endsWith("@")) {
        setAtSuggestionOpen(true);
      } else {
        setAtSuggestionOpen(false);
      }
    }
  };

  const insertAtSuggestion = (varName: string) => {
    const textarea = aiPromptRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const textBefore = aiPromptText.slice(0, cursor);
    const textAfter = aiPromptText.slice(cursor);
    const lastAtIdx = textBefore.lastIndexOf("@");
    if (lastAtIdx !== -1) {
      const newText = textBefore.slice(0, lastAtIdx) + `@${varName}` + textAfter;
      setAiPromptText(newText);
      setAtSuggestionOpen(false);
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = lastAtIdx + varName.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 50);
    }
  };

  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col relative lg:col-span-2">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme bg-[rgba(var(--accent-rgb),0.03)]">
        <BrainCircuit size={15} className="text-accent" />
        <h3 className="text-sm font-bold text-1">AI System Prompt</h3>
        {aiPromptSaving && (
          <span className="text-[10px] text-3">Menyimpan...</span>
        )}
        {aiPromptSaved && (
          <span className="text-[10px] text-[#34d399] font-medium">Tersimpan!</span>
        )}
      </div>

      <div className="p-4 sm:p-5 flex-1 flex flex-col space-y-3">
        <p className="text-xs leading-relaxed text-2">
          Sesuaikan instruksi AI untuk akun ini secara spesifik. Ketik <span className="font-mono text-accent">@</span> untuk memanggil variabel kustom seperti <span className="font-mono text-accent">@keyword</span>, <span className="font-mono text-accent">@usermessage</span>, <span className="font-mono text-accent">@blockedkeyword</span>, atau <span className="font-mono text-accent">@filterwords</span>.
        </p>

        <div className="relative">
          <textarea
            ref={aiPromptRef}
            value={aiPromptText}
            onChange={(e) => handleAiPromptChange(e.target.value)}
            placeholder={DEFAULT_AI_PROMPT}
            className="input-cyber w-full h-[480px] px-3 py-2.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />

          {atSuggestionOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-56 bg-card border border-theme rounded-lg shadow-xl z-20 overflow-hidden">
              <div className="text-[10px] font-bold px-3 py-1.5 border-b border-theme text-3 uppercase tracking-wider">
                Variabel Tersedia
              </div>
              <button
                type="button"
                onClick={() => insertAtSuggestion("keyword")}
                className="w-full text-left px-3 py-2 text-xs hover:bg-card-hover text-1 font-mono transition flex justify-between items-center"
              >
                <span>@keyword</span>
                <span className="text-[9px] text-3 font-sans">Target Keyword</span>
              </button>
              <button
                type="button"
                onClick={() => insertAtSuggestion("usermessage")}
                className="w-full text-left px-3 py-2 text-xs hover:bg-card-hover text-1 font-mono transition flex justify-between items-center"
              >
                <span>@usermessage</span>
                <span className="text-[9px] text-3 font-sans">Isi Pesan Masuk</span>
              </button>
              <button
                type="button"
                onClick={() => insertAtSuggestion("blockedkeyword")}
                className="w-full text-left px-3 py-2 text-xs hover:bg-card-hover text-1 font-mono transition flex justify-between items-center"
              >
                <span>@blockedkeyword</span>
                <span className="text-[9px] text-3 font-sans">Filter Words</span>
              </button>
              <button
                type="button"
                onClick={() => insertAtSuggestion("filterwords")}
                className="w-full text-left px-3 py-2 text-xs hover:bg-card-hover text-1 font-mono transition flex justify-between items-center"
              >
                <span>@filterwords</span>
                <span className="text-[9px] text-3 font-sans">Alias</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const confirmReset = window.confirm("Reset prompt akun ini ke default global?");
                if (confirmReset) {
                  setAiPromptText(DEFAULT_AI_PROMPT);
                  saveAiPrompt(DEFAULT_AI_PROMPT);
                }
              }}
              className="text-[10px] text-3 hover:text-accent font-semibold transition"
            >
              Reset ke Default
            </button>
            <span className="text-3 text-[10px]">|</span>
            <span className="text-[9px] text-3 font-mono">
              {aiPromptText.length} karakter
            </span>
          </div>

          <button
            type="button"
            onClick={() => saveAiPrompt(aiPromptText)}
            disabled={aiPromptSaving}
            className="btn-accent px-4 py-1.5 h-8 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
          >
            {aiPromptSaving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check size={12} />
                Simpan Prompt
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
export default AiPromptSection;
