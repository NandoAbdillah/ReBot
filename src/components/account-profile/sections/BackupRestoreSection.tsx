import React, { useRef, useState } from "react";
import { Download, Upload, Send, Loader2 } from "lucide-react";

export interface BackupRestoreSectionProps {
  exportSettings: () => void;
  importSettings: (file: File) => void;
  importStatus: string;
  importError: string;
  accountId?: string;
}

export function BackupRestoreSection({
  exportSettings,
  importSettings,
  importStatus,
  importError,
  accountId,
}: BackupRestoreSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendingTg, setSendingTg] = useState(false);
  const [tgStatus, setTgStatus] = useState<string | null>(null);
  const [tgError, setTgError] = useState<string | null>(null);

  const handleSendToTelegram = async () => {
    setSendingTg(true);
    setTgStatus(null);
    setTgError(null);
    try {
      const res = await fetch("/api/deployment/send-backup-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal mengirim backup ke Telegram");
      }
      setTgStatus(`File cadangan berhasil dikirim ke Pesan Tersimpan Telegram (${data.sentCount} akun).`);
      setTimeout(() => setTgStatus(null), 5000);
    } catch (err: any) {
      setTgError(err.message || "Gagal mengirim backup ke Telegram");
    } finally {
      setSendingTg(false);
    }
  };

  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col lg:col-span-2">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme">
        <Download size={15} className="text-accent" />
        <h3 className="text-sm font-bold text-1">Backup & Restore</h3>
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>
          Ekspor seluruh konfigurasi akun (keyword, target, filter, dll)
          ke file JSON, kirim ke Pesan Tersimpan Telegram, atau impor dari file backup.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            onClick={exportSettings}
            className="btn-accent px-3.5 py-2.5 text-xs flex items-center justify-center gap-2"
          >
            <Download size={13} /> Ekspor Konfigurasi
          </button>
          <button
            onClick={handleSendToTelegram}
            disabled={sendingTg}
            className="btn-ghost px-3.5 py-2.5 text-xs flex items-center justify-center gap-2"
            title="Kirim file snapshot backup langsung ke Pesan Tersimpan (Saved Messages) akun Telegram"
          >
            {sendingTg ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            <span>{sendingTg ? "Mengirim..." : "Kirim ke Telegram"}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-ghost px-3.5 py-2.5 text-xs flex items-center justify-center gap-2"
          >
            <Upload size={13} /> Impor Konfigurasi
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importSettings(file);
              e.target.value = "";
            }}
          />
        </div>

        {importStatus && (
          <p
            className="mt-3 text-xs font-medium"
            style={{ color: "#34d399" }}
          >
            {importStatus}
          </p>
        )}
        {importError && (
          <p
            className="mt-3 text-xs font-medium"
            style={{ color: "#fb7185" }}
          >
            {importError}
          </p>
        )}
        {tgStatus && (
          <p
            className="mt-3 text-xs font-medium"
            style={{ color: "#34d399" }}
          >
            {tgStatus}
          </p>
        )}
        {tgError && (
          <p
            className="mt-3 text-xs font-medium"
            style={{ color: "#fb7185" }}
          >
            {tgError}
          </p>
        )}
      </div>
    </div>
  );
}
export default BackupRestoreSection;
