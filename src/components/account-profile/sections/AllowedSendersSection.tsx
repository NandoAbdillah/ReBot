import React from "react";
import { Shield, Loader2, Plus, X } from "lucide-react";

export interface AllowedSendersSectionProps {
  allowedSendersEnabled: boolean;
  allowedSenders: string[];
  senderInput: string;
  setSenderInput: (val: string) => void;
  isSaving: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onAddSender: () => void;
  onRemoveSender: (s: string) => void;
}

export function AllowedSendersSection({
  allowedSendersEnabled,
  allowedSenders,
  senderInput,
  setSenderInput,
  isSaving,
  onToggleEnabled,
  onAddSender,
  onRemoveSender,
}: AllowedSendersSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme bg-[rgba(var(--accent-rgb),0.03)]">
        <Shield size={15} className="text-accent" />
        <h3 className="text-sm font-bold text-1">Allowed Senders</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold bg-[rgba(var(--accent-rgb),0.08)] ${
            allowedSendersEnabled
              ? "text-accent-bright"
              : "text-3"
          }`}
        >
          {(allowedSenders || []).length} Sender
        </span>
        <div
          className={`toggle-track ml-auto shrink-0 ${allowedSendersEnabled ? "active" : ""}`}
          style={{ opacity: isSaving ? 0.6 : 1 }}
          onClick={() => {
            if (!isSaving) onToggleEnabled(!allowedSendersEnabled);
          }}
        >
          <div className="toggle-thumb" />
        </div>
      </div>

      <div
        className={`p-4 sm:p-5 flex-1 transition-opacity ${
          allowedSendersEnabled
            ? ""
            : "opacity-40 pointer-events-none"
        }`}
      >
        <p className="text-xs mb-3 leading-relaxed text-2">
          Bot <span className="font-semibold text-[#f43f5e]">HANYA</span>{" "}
          merespon pesan yang{" "}
          <span className="font-semibold text-1">Author Signature</span>
          -nya cocok. Kosongkan agar bot merespon semua sender.{" "}
          <span className="font-medium text-accent">
            Berguna mencegah jebakan admin menfess.
          </span>
        </p>

        <div className="flex gap-2 mb-4">
          <input
            value={senderInput}
            onChange={(e) => setSenderInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddSender();
            }}
            disabled={isSaving}
            placeholder="Ketik sender… (contoh: wtb, wts)"
            className="input-cyber flex-1 h-10 sm:h-9 px-3"
          />
          <button
            onClick={onAddSender}
            disabled={isSaving || !senderInput.trim()}
            className="btn-accent w-10 sm:w-9 h-10 sm:h-9 flex items-center justify-center disabled:opacity-40 shrink-0"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(allowedSenders || []).map((sender) => (
            <span key={sender} className="chip">
              {sender}
              <button
                onClick={() => onRemoveSender(sender)}
                disabled={isSaving}
                className="transition disabled:opacity-50 text-accent hover:text-accent-bright"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {(allowedSenders || []).length === 0 && (
            <p className="text-xs text-center py-5 w-full italic text-3">
              Kosong — bot merespon semua sender
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default AllowedSendersSection;
