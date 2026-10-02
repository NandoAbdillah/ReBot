import React, { useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Pencil,
  Check,
  Loader2,
  Sparkles,
  Tag,
  MessageSquare,
  Upload,
} from "lucide-react";
import { ResponseRule, ReplyItem, callAiSuggest, genId } from "../types";

export interface RuleModalProps {
  rule: ResponseRule | null; // null → add new
  onSave: (rule: ResponseRule) => void;
  onClose: () => void;
}

export function ResponseRuleModal({ rule, onSave, onClose }: RuleModalProps) {
  const [keywords, setKeywords] = useState<string[]>(rule?.keywords ?? []);
  const [replies, setReplies] = useState<ReplyItem[]>(rule?.replies ?? []);
  const [newReplyMedia, setNewReplyMedia] = useState<string[]>([]);
  const [editMedia, setEditMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [kwInput, setKwInput] = useState("");
  const [replyInput, setReplyInput] = useState("");

  const handleUploadForNewReply = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        if (data.success) {
          uploaded.push(data.filename);
        } else {
          alert("Upload gagal: " + (data.error || "Error tidak diketahui"));
        }
      }
      setNewReplyMedia((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      alert("Gagal mengupload file: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleUploadForEditReply = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        if (data.success) {
          uploaded.push(data.filename);
        } else {
          alert("Upload gagal: " + (data.error || "Error tidak diketahui"));
        }
      }
      setEditMedia((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      alert("Gagal mengupload file: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Inline reply editing
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  // AI synonym suggestions for keywords
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ── keyword helpers ── */
  const addKw = () => {
    const v = kwInput.trim().toLowerCase();
    if (!v || keywords.includes(v)) return;
    setKeywords([...keywords, v]);
    setKwInput("");
  };
  const removeKw = (k: string) => setKeywords(keywords.filter((x) => x !== k));

  /* ── reply helpers ── */
  const addReply = () => {
    const text = replyInput.trim();
    if (!text && newReplyMedia.length === 0) return;
    if (replies.length >= 3) return;
    setReplies([...replies, { text, media: newReplyMedia }]);
    setReplyInput("");
    setNewReplyMedia([]);
  };
  const removeReply = (i: number) =>
    setReplies(replies.filter((_, idx) => idx !== i));
  const saveEditReply = (i: number) => {
    const text = editVal.trim();
    if (!text && editMedia.length === 0) return removeReply(i);
    const updated = [...replies];
    updated[i] = { text, media: editMedia };
    setReplies(updated);
    setEditIdx(null);
  };

  /* ── AI helpers ── */
  const generateSynonyms = async () => {
    const base = kwInput.trim() || keywords[0];
    if (!base) return;
    setAiLoading(true);
    setAiSuggestions([]);
    setSelected(new Set());
    const suggestions = await callAiSuggest("keyword-synonyms", base);
    setAiSuggestions(suggestions.filter((s) => !keywords.includes(s)));
    setAiLoading(false);
  };
  const toggleSuggestion = (s: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  const addSelected = () => {
    setKeywords([
      ...keywords,
      ...Array.from(selected).filter((k) => !keywords.includes(k)),
    ]);
    setSelected(new Set());
    setAiSuggestions([]);
  };

  const canSave = keywords.length > 0 && replies.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="cyber-card w-full max-w-lg flex flex-col"
        style={{ maxHeight: "90vh" }}
      >
        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-theme flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-accent" />
            <h3 className="text-sm font-bold text-1">
              {rule ? "Edit Rule" : "Tambah Rule Baru"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-3 hover:text-1 transition rounded-lg hover:bg-card-hover"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5 scrollbar-thin">
          {/* ─── Section 1: Keywords ─── */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-1 flex items-center gap-1.5">
                <Tag size={12} className="text-accent" />
                Keywords (Grup Sinonim)
              </label>
              <span className="text-xs text-3">{keywords.length} kata</span>
            </div>
            <p className="text-xs text-3 mb-3 leading-relaxed">
              Semua keyword di grup ini dianggap setara. Bot merespons jika
              salah satu terdeteksi — misalnya "netflix", "netfliz", dan "ntflx"
              bisa berada di level yang sama.
            </p>

            {/* Keyword chips */}
            <div className="flex flex-wrap gap-1.5 mb-3 min-h-[2rem] items-start">
              {keywords.map((kw) => (
                <span key={kw} className="chip font-mono text-xs">
                  {kw}
                  <button
                    onClick={() => removeKw(kw)}
                    className="text-accent hover:text-accent-bright transition"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {keywords.length === 0 && (
                <span className="text-xs italic text-3 self-center">
                  Belum ada keyword
                </span>
              )}
            </div>

            {/* Add keyword input */}
            <div className="flex gap-2">
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKw()}
                placeholder="Ketik keyword lalu Enter / klik +"
                className="input-cyber flex-1 h-9 px-3 text-xs"
              />
              <button
                onClick={generateSynonyms}
                disabled={
                  aiLoading || (!kwInput.trim() && keywords.length === 0)
                }
                title="AI: Generate sinonim & varian ejaan"
                className="btn-ghost w-9 h-9 flex items-center justify-center shrink-0 border border-accent/20 hover:border-accent/50 disabled:opacity-40"
              >
                {aiLoading ? (
                  <Loader2 size={13} className="animate-spin text-accent" />
                ) : (
                  <Sparkles size={13} className="text-accent" />
                )}
              </button>
              <button
                onClick={addKw}
                disabled={!kwInput.trim()}
                className="btn-accent w-9 h-9 flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
            </div>

            {/* AI Suggestions */}
            {aiSuggestions.length > 0 && (
              <div className="mt-3 p-3 bg-[rgba(var(--accent-rgb),0.05)] border border-accent/20 rounded-xl">
                <p className="text-xs font-semibold text-accent mb-2.5 flex items-center gap-1.5">
                  <Sparkles size={11} />
                  Saran AI — klik untuk pilih varian:
                </p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {aiSuggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSuggestion(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-mono transition ${
                        selected.has(s)
                          ? "bg-accent/20 border-accent/60 text-accent font-semibold"
                          : "bg-card-hover border-theme text-2 hover:border-accent/40"
                      }`}
                    >
                      {selected.has(s) && (
                        <Check size={10} className="inline mr-1" />
                      )}
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addSelected}
                    disabled={selected.size === 0}
                    className="btn-accent px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    + Tambah Terpilih ({selected.size})
                  </button>
                  <button
                    onClick={() => {
                      setAiSuggestions([]);
                      setSelected(new Set());
                    }}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </section>

          <div className="h-px bg-theme" />

          {/* ─── Section 2: Replies ─── */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-1 flex items-center gap-1.5">
                <MessageSquare size={12} className="text-accent" />
                Balasan Beruntun (maks. 3)
              </label>
              <span
                className={`text-xs font-medium ${
                  replies.length >= 3 ? "text-[#f43f5e]" : "text-3"
                }`}
              >
                {replies.length}/3
              </span>
            </div>
            <p className="text-xs text-3 mb-3 leading-relaxed">
              Bot akan mengirimkan SEMUA balasan ini secara beruntun. Jeda antar
              pesan akan mengikuti setelan Anti-Spam di bawah agar akun tidak
              terkena spam.
            </p>

            {/* Existing replies */}
            <div className="space-y-3 mb-4">
              {replies.map((reply, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <span className="w-5 text-center text-[10px] font-bold text-accent/70 mt-2.5 shrink-0">
                    {i + 1}
                  </span>
                  {editIdx === i ? (
                    <div className="flex-1 space-y-2 bg-[rgba(var(--accent-rgb),0.02)] border border-theme p-3 rounded-lg">
                      <textarea
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        rows={2}
                        autoFocus
                        className="input-cyber w-full px-3 py-2 text-xs resize-none"
                        placeholder="Tulis balasan..."
                      />
                      
                      {/* Media management inside edit block */}
                      <div>
                        <span className="text-[10px] font-semibold text-2 block mb-1">Media Balasan:</span>
                        {editMedia.length > 0 && (
                          <div className="grid grid-cols-4 gap-1.5 mb-2">
                            {editMedia.map((m, idx) => {
                              const isVideo = m.endsWith(".mp4") || m.endsWith(".webm") || m.endsWith(".mov");
                              return (
                                <div key={idx} className="relative aspect-video rounded bg-card-hover overflow-hidden border border-theme flex items-center justify-center group">
                                  {isVideo ? (
                                    <video src={`/media/${m}`} className="w-full h-full object-cover" muted />
                                  ) : (
                                    <img src={`/media/${m}`} alt="media" className="w-full h-full object-cover" />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditMedia(editMedia.filter((_, mi) => mi !== idx))}
                                    className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] text-[#f43f5e] font-semibold"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="relative">
                          <input
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            onChange={handleUploadForEditReply}
                            disabled={uploading}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <button type="button" className="btn-ghost w-full h-8 text-[10px] flex items-center justify-center gap-1 border-dashed border-accent/20">
                            {uploading ? <Loader2 size={10} className="animate-spin text-accent" /> : <Upload size={10} className="text-accent" />}
                            Tambah Media ke Balasan Ini
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-1.5 pt-1.5">
                        <button
                          onClick={() => saveEditReply(i)}
                          className="btn-accent px-3 py-1 text-xs flex items-center gap-1"
                        >
                          <Check size={11} /> Simpan
                        </button>
                        <button
                          onClick={() => setEditIdx(null)}
                          className="btn-ghost px-3 py-1 text-xs"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-1.5 p-3 bg-card-hover border border-theme rounded-lg group">
                      <div className="flex items-start gap-2">
                        <p className="text-xs leading-relaxed text-2 flex-1 whitespace-pre-wrap">
                          {reply.text || <span className="italic text-3">(Hanya media)</span>}</p>
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => {
                              setEditIdx(i);
                              setEditVal(reply.text);
                              setEditMedia(reply.media || []);
                            }}
                            className="p-1 text-3 hover:text-accent rounded transition"
                            title="Edit balasan"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => removeReply(i)}
                            className="p-1 text-3 hover:text-[#f43f5e] rounded transition"
                            title="Hapus balasan"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Display media preview strip */}
                      {reply.media && reply.media.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {reply.media.map((m, idx) => {
                            const isVideo = m.endsWith(".mp4") || m.endsWith(".webm") || m.endsWith(".mov");
                            return (
                              <div key={idx} className="w-10 h-10 rounded border border-theme/50 overflow-hidden bg-black/20 flex items-center justify-center shrink-0">
                                {isVideo ? (
                                  <video src={`/media/${m}`} className="w-full h-full object-cover" muted />
                                ) : (
                                  <img src={`/media/${m}`} alt="preview" className="w-full h-full object-cover" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {replies.length === 0 && (
                <p className="text-xs italic text-3 py-1">Belum ada balasan</p>
              )}
            </div>

            {/* Add reply textarea + media upload */}
            {replies.length < 3 ? (
              <div className="space-y-2.5 p-3.5 border border-dashed border-accent/20 rounded-xl bg-[rgba(var(--accent-rgb),0.01)]">
                <textarea
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder={`Tulis balasan ${replies.length + 1}…`}
                  rows={2}
                  className="input-cyber w-full px-3 py-2 resize-none text-xs"
                />

                {/* Previews for uploading new reply media */}
                {newReplyMedia.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {newReplyMedia.map((m, idx) => {
                      const isVideo = m.endsWith(".mp4") || m.endsWith(".webm") || m.endsWith(".mov");
                      return (
                        <div key={idx} className="relative aspect-video rounded bg-card-hover overflow-hidden border border-theme flex items-center justify-center group">
                          {isVideo ? (
                            <video src={`/media/${m}`} className="w-full h-full object-cover" muted />
                          ) : (
                            <img src={`/media/${m}`} alt="uploading" className="w-full h-full object-cover" />
                          )}
                          <button
                            type="button"
                            onClick={() => setNewReplyMedia(newReplyMedia.filter((_, mi) => mi !== idx))}
                            className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] text-[#f43f5e] font-semibold"
                          >
                            Hapus
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Upload Button for New Reply */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleUploadForNewReply}
                      disabled={uploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                    />
                    <button type="button" className="btn-ghost w-full h-9 text-xs flex items-center justify-center gap-1.5 border-dashed border-accent/20">
                      {uploading ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-accent" />
                          <span>Mengunggah...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={13} className="text-accent/60" />
                          <span>Upload Media Balasan</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <button
                    onClick={addReply}
                    disabled={!replyInput.trim() && newReplyMedia.length === 0}
                    className="btn-accent px-4 h-9 text-xs flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Plus size={13} /> Tambah Balasan
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] text-xs text-[#fbbf24]">
                Batas maksimal 3 balasan beruntun sudah tercapai. Hapus salah
                satu untuk menambah yang baru.
              </div>
            )}
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 border-t border-theme flex items-center gap-3 shrink-0">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
            Batal
          </button>
          {!canSave && (
            <p className="text-xs text-3 flex-1">
              {keywords.length === 0
                ? "Tambah minimal 1 keyword"
                : "Tambah minimal 1 balasan"}
            </p>
          )}
          <button
            onClick={() =>
              onSave({ id: rule?.id || genId(), keywords, replies })
            }
            disabled={!canSave}
            className="btn-accent ml-auto px-5 py-2 text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
          >
            <Check size={14} />
            {rule ? "Simpan Perubahan" : "Tambah Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
export default ResponseRuleModal;
