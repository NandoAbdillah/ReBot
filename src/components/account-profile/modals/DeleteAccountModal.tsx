import React, { useState } from "react";
import { ShieldAlert, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";

export interface DeleteAccountModalProps {
  accountId: string;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (accountId: string) => Promise<void> | void;
}

export function DeleteAccountModal({
  accountId,
  isOpen,
  onClose,
  onDelete,
}: DeleteAccountModalProps) {
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setDeleteConfirmation("");
    setIsDeleteConfirmed(false);
    setDeleteError("");
    onClose();
  };

  const isInputValid = () => {
    const input = deleteConfirmation.trim();
    if (!input) return false;
    return (
      input.toLowerCase() === accountId.toLowerCase() ||
      input.toUpperCase() === "HAPUS"
    );
  };

  const handleDelete = async () => {
    if (!isDeleteConfirmed) {
      setDeleteError("Centang kotak persetujuan konfirmasi di bawah terlebih dahulu.");
      return;
    }
    const input = deleteConfirmation.trim();
    const isValid =
      input.toLowerCase() === accountId.toLowerCase() ||
      input.toUpperCase() === "HAPUS";

    if (!isValid) {
      setDeleteError(`Ketik "${accountId}" atau "HAPUS" untuk mengonfirmasi penghapusan.`);
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(accountId);
      handleClose();
    } catch (err: any) {
      setDeleteError(err.message || "Gagal menghapus akun.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop-theme p-4">
      <div
        className="cyber-card modal-glass w-full max-w-md p-6 flex flex-col relative z-10 space-y-4 animate-fade-in rounded-2xl shadow-2xl"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 text-[#f43f5e]">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[rgba(244,63,94,0.1)] border border-[rgba(244,63,94,0.2)] shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-1">Hapus Akun Permanen</h3>
            <p className="text-xs text-3">Tindakan ini tidak bisa dibatalkan</p>
          </div>
        </div>

        {/* Warning Message */}
        <div className="p-3.5 rounded-xl text-xs bg-[rgba(244,63,94,0.05)] border border-[rgba(244,63,94,0.15)] text-[#f43f5e]/90 leading-relaxed">
          Konfigurasi, riwayat, dan sesi Telegram untuk akun <strong className="text-1">{accountId}</strong> akan dihapus permanen dari server. Bot akan dinonaktifkan sepenuhnya.
        </div>

        {/* Input Konfirmasi */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-2 block">
            Ketik nama akun <span className="text-1 font-mono">"{accountId}"</span> atau kata sandi konfirmasi:
          </label>
          <div className="relative">
            <input
              type={showDeletePassword ? "text" : "password"}
              value={deleteConfirmation}
              onChange={(e) => {
                setDeleteConfirmation(e.target.value);
                setDeleteError("");
              }}
              placeholder={`Ketik ${accountId} atau HAPUS`}
              className="input-cyber w-full h-11 px-3 pr-10 text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowDeletePassword(!showDeletePassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition p-1 text-3 hover:text-2"
            >
              {showDeletePassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <span className="text-[10px] text-3 block">
            Ketik <strong className="text-1">{accountId}</strong>, <strong className="text-1">HAPUS</strong>, atau password login Anda.
          </span>
        </div>

        {/* Checkbox confirmation */}
        <label className="flex items-start gap-3 cursor-pointer select-none py-1">
          <div className="relative shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={isDeleteConfirmed}
              onChange={(e) => {
                setIsDeleteConfirmed(e.target.checked);
                setDeleteError("");
              }}
              className="sr-only peer"
            />
            <div
              className="w-4 h-4 rounded border transition-colors flex items-center justify-center"
              style={{
                borderColor: isDeleteConfirmed ? "var(--accent)" : "var(--border)",
                backgroundColor: isDeleteConfirmed ? "var(--accent)" : "transparent",
              }}
            >
              {isDeleteConfirmed && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>
          <span className="text-xs text-3 leading-tight">
            Saya mengerti dampak penghapusan ini dan ingin menghapus akun <span className="text-1 font-medium">{accountId}</span> secara permanen.
          </span>
        </label>

        {/* Error Message */}
        {deleteError && (
          <div className="text-xs text-[#f43f5e] bg-[rgba(244,63,94,0.05)] border border-[rgba(244,63,94,0.15)] px-3 py-2.5 rounded-lg animate-fade-in">
            {deleteError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="btn-ghost flex-1 h-11 text-xs"
          >
            Batal
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting || !isDeleteConfirmed || !isInputValid()}
            className="btn-accent bg-[#f43f5e] hover:bg-[#e11d48] flex-1 h-11 text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {isDeleting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Menghapus...</span>
              </>
            ) : (
              <>
                <Trash2 size={13} />
                <span>Hapus Permanen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
export default DeleteAccountModal;
