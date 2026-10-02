import React, { useState } from "react";
import {
  X,
  Send,
  Plus,
  Trash2,
  Check,
  Loader2,
  Tag,
  Upload,
} from "lucide-react";
import { BroadcastJob, BroadcastItem, genId } from "../types";

export interface BroadcastJobModalProps {
  job: BroadcastJob | null; // null → new job
  onSave: (job: BroadcastJob) => void;
  onClose: () => void;
  saving: boolean;
}

export function BroadcastJobModal({ job, onSave, onClose, saving }: BroadcastJobModalProps) {
  const [name, setName] = useState(job?.name ?? "");
  const [targetGroup, setTargetGroup] = useState(job?.targetGroup ?? "");
  const [items, setItems] = useState<BroadcastItem[]>(job?.items ?? []);
  const [intervalMode, setIntervalMode] = useState<"fixed" | "random">(
    job && job.intervalMin !== job.intervalMax ? "random" : "fixed"
  );
  const [intervalFixed, setIntervalFixed] = useState(job?.intervalMin ?? 60);
  const [intervalMin, setIntervalMin] = useState(job?.intervalMin ?? 45);
  const [intervalMax, setIntervalMax] = useState(job?.intervalMax ?? 90);
  const [isActive, setIsActive] = useState(job?.isActive ?? true);
  const [keywords, setKeywords] = useState<string[]>(job?.keywords ?? []);
  const [kwInput, setKwInput] = useState("");

  const addKw = () => {
    const v = kwInput.trim().toLowerCase();
    if (!v || keywords.includes(v)) return;
    setKeywords([...keywords, v]);
    setKwInput("");
  };
  const removeKw = (k: string) => setKeywords(keywords.filter((x) => x !== k));

  // New item state
  const [newItemText, setNewItemText] = useState("");
  const [newItemMedia, setNewItemMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/media/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, base64 }),
        });
        const data = await res.json();
        if (data.success) uploaded.push(data.filename);
        else alert("Upload gagal: " + (data.error || "Error"));
      }
      setNewItemMedia((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      alert("Gagal mengupload: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const addItem = () => {
    if (!newItemText.trim() && newItemMedia.length === 0) return;
    setItems((prev) => [...prev, { text: newItemText.trim(), media: newItemMedia }]);
    setNewItemText("");
    setNewItemMedia([]);
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (!targetGroup.trim()) { alert("Target grup wajib diisi"); return; }
    if (items.length === 0) { alert("Minimal 1 item konten"); return; }
    const finalMin = intervalMode === "fixed" ? intervalFixed : intervalMin;
    const finalMax = intervalMode === "fixed" ? intervalFixed : intervalMax;
    onSave({
      id: job?.id || genId(),
      name: name.trim() || "Broadcast Job",
      targetGroup: targetGroup.trim(),
      items,
      intervalMin: finalMin,
      intervalMax: finalMax,
      isActive,
      keywords,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="cyber-modal max-w-lg w-full bg-card border border-theme rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-theme flex items-center justify-between bg-[rgba(var(--accent-rgb),0.03)]">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-accent" />
            <h3 className="text-sm font-bold text-1">
              {job ? "Edit Broadcast Job" : "Tambah Broadcast Job"}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-3 hover:text-1 transition p-1 hover:bg-card-hover rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Job Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-2 block">Nama Job</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Promo Bundle LPM"
              className="input-cyber w-full h-9 px-3 text-sm"
            />
          </div>

          {/* Target Group */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-2 block">Target Grup / Channel</label>
            <input
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
              placeholder="@username atau -100123456789"
              className="input-cyber w-full h-9 px-3 text-sm font-mono"
            />
            <p className="text-[11px] text-3">Pastikan akun sudah bergabung ke grup/channel target.</p>
          </div>

          {/* Trigger Keywords */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-2 flex items-center gap-1.5">
              <Tag size={12} className="text-accent" />
              Trigger Keywords (Opsional)
            </label>
            <p className="text-[11px] text-3">
              Jika diisi, bot akan membalas pesan masuk di grup target yang mengandung keyword ini (tanpa masuk ke AI Intent). Kosongkan agar hanya melakukan broadcast berkala saja.
            </p>
            {/* Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[20px] items-start">
              {keywords.map((kw) => (
                <span key={kw} className="chip font-mono text-xs">
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKw(kw)}
                    className="text-accent hover:text-accent-bright transition ml-1"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              {keywords.length === 0 && (
                <span className="text-[11px] italic text-3 self-center">
                  Hanya broadcast berkala (tanpa keyword trigger)
                </span>
              )}
            </div>
            {/* Input row */}
            <div className="flex gap-2">
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKw();
                  }
                }}
                placeholder="Ketik keyword lalu Enter / klik +"
                className="input-cyber flex-1 h-9 px-3 text-xs"
              />
              <button
                type="button"
                onClick={addKw}
                disabled={!kwInput.trim()}
                className="btn-accent w-9 h-9 flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Interval */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-2 block">Jeda Pengiriman</label>
            <div className="flex gap-2">
              {(["fixed", "random"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setIntervalMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                    intervalMode === mode
                      ? "bg-[rgba(var(--accent-rgb),0.15)] border-accent/40 text-accent-bright"
                      : "border-theme text-3 hover:bg-card-hover"
                  }`}
                >
                  {mode === "fixed" ? "⏱ Tetap" : "🎲 Acak"}
                </button>
              ))}
            </div>
            {intervalMode === "fixed" ? (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={5}
                  value={intervalFixed}
                  onChange={(e) => setIntervalFixed(Number(e.target.value))}
                  className="input-cyber w-24 h-9 px-3 text-sm text-center"
                />
                <span className="text-xs text-3">detik per kirim</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className="input-cyber w-20 h-9 px-3 text-sm text-center"
                />
                <span className="text-xs text-3">–</span>
                <input
                  type="number"
                  min={intervalMin}
                  value={intervalMax}
                  onChange={(e) => setIntervalMax(Number(e.target.value))}
                  className="input-cyber w-20 h-9 px-3 text-sm text-center"
                />
                <span className="text-xs text-3">detik (jeda acak)</span>
              </div>
            )}
            <p className="text-[11px] text-3">
              {intervalMode === "random"
                ? "Jeda acak membuat bot terlihat lebih natural dan tidak mudah terdeteksi."
                : "Jeda tetap — setiap pesan dikirim persis setelah interval yang ditentukan."}
            </p>
          </div>

          {/* Aktif toggle */}
          <div className="flex items-center justify-between p-3 bg-card-hover rounded-xl border border-theme">
            <div>
              <p className="text-xs font-semibold text-1">Aktifkan Job</p>
              <p className="text-[11px] text-3 mt-0.5">Job akan langsung berjalan setelah disimpan</p>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative w-11 h-6 rounded-full transition-colors ${isActive ? "bg-[rgba(var(--accent-rgb),0.8)]" : "bg-theme"}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isActive ? "left-5.5" : "left-0.5"}`}
                style={{ left: isActive ? "22px" : "2px" }}
              />
            </button>
          </div>

          {/* Items list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-2">Konten ({items.length} item)</label>
              <p className="text-[11px] text-3">Bot memilih 1 item secara acak setiap kirim</p>
            </div>

            {items.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 p-3 bg-card-hover border border-theme rounded-lg group">
                    <div className="flex-1 min-w-0">
                      {item.text && <p className="text-xs text-2 truncate">{item.text}</p>}
                      {item.media && item.media.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {item.media.map((m, mi) => {
                            const isVideo = /\.(mp4|webm|mov)$/i.test(m);
                            return (
                              <div key={mi} className="w-8 h-8 rounded border border-theme/50 overflow-hidden bg-black/20 flex items-center justify-center shrink-0">
                                {isVideo
                                  ? <video src={`/media/${m}`} className="w-full h-full object-cover" muted />
                                  : <img src={`/media/${m}`} alt="preview" className="w-full h-full object-cover" />
                                }
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!item.text && (!item.media || item.media.length === 0) && (
                        <span className="text-xs italic text-3">Item kosong</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="shrink-0 p-1 text-3 hover:text-[#f43f5e] rounded transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new item */}
            <div className="space-y-2 p-3.5 border border-dashed border-accent/20 rounded-xl bg-[rgba(var(--accent-rgb),0.01)]">
              <textarea
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Tulis teks pesan (opsional)..."
                rows={2}
                className="input-cyber w-full px-3 py-2 resize-none text-xs"
              />
              {newItemMedia.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {newItemMedia.map((m, idx) => {
                    const isVideo = /\.(mp4|webm|mov)$/i.test(m);
                    return (
                      <div key={idx} className="relative w-12 h-12 rounded border border-theme/50 overflow-hidden bg-black/20 group">
                        {isVideo
                          ? <video src={`/media/${m}`} className="w-full h-full object-cover" muted />
                          : <img src={`/media/${m}`} alt="preview" className="w-full h-full object-cover" />
                        }
                        <button
                          type="button"
                          onClick={() => setNewItemMedia((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                        >
                          <X size={10} className="text-white" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <button type="button" className="btn-ghost w-full h-8 text-[10px] flex items-center justify-center gap-1 border-dashed border-accent/20">
                    {uploading ? <Loader2 size={10} className="animate-spin text-accent" /> : <Upload size={10} className="text-accent" />}
                    Tambah Media
                  </button>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!newItemText.trim() && newItemMedia.length === 0}
                  className="btn-accent px-3 h-8 text-xs flex items-center gap-1 disabled:opacity-40"
                >
                  <Plus size={11} /> Tambah Item
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-theme flex items-center justify-between gap-3 bg-[rgba(var(--accent-rgb),0.02)]">
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost px-4 py-2 text-xs">
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !targetGroup.trim() || items.length === 0}
            className="btn-accent px-5 py-2 text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {job ? "Simpan Perubahan" : "Buat Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
export default BroadcastJobModal;
