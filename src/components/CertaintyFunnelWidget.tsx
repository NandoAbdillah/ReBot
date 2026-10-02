// src/components/CertaintyFunnelWidget.tsx
import React, { useState } from "react";
import {
  Activity,
  Target,
  ShieldAlert,
  Send,
  Clock,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Info,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Filter,
  XCircle,
  ListFilter,
  X,
} from "lucide-react";
import { FunnelStats, SmartAdvice } from "../types";

interface CertaintyFunnelWidgetProps {
  funnel?: FunnelStats;
  todaySuccess: number;
  smartAdvice?: SmartAdvice[];
  connectedCount: number;
  totalAccounts: number;
}

export default function CertaintyFunnelWidget({
  funnel,
  todaySuccess,
  smartAdvice = [],
  connectedCount,
  totalAccounts,
}: CertaintyFunnelWidgetProps) {
  const [showBlockedModal, setShowBlockedModal] = useState(false);

  const heard = funnel?.messagesHeard || 0;
  const matched = funnel?.keywordMatches || 0;
  const blocked = funnel?.blockedFilterWords || 0;
  const skipped = funnel?.skippedPostFilter || 0;
  const deliveryFailed = funnel?.deliveryFailed || 0;
  const sent = todaySuccess || 0;
  const slowmode = funnel?.slowmodeDelayed || 0;
  const flood = funnel?.floodWaitCount || 0;
  const blockedReasons = funnel?.blockedReasons || {};

  const triggerCount = funnel?.triggerSuccess ?? Math.max(0, sent - (funnel?.broadcastSuccess || 0));
  const broadcastCount = funnel?.broadcastSuccess ?? 0;

  // Rasio konversi corong
  const keywordRate = heard > 0 ? ((matched / heard) * 100).toFixed(1) : "0.0";
  const sentRate = matched > 0 ? ((sent / matched) * 100).toFixed(1) : "0.0";

  // Sorted blocked reasons
  const sortedBlockedReasons = Object.entries(blockedReasons)
    .sort((a, b) => b[1] - a[1]);

  // Status bot
  let statusBadge = {
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    text: "Pemindaian Aktif",
  };

  if (connectedCount === 0) {
    statusBadge = {
      color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      text: "Semua Akun Offline",
    };
  } else if (heard === 0) {
    statusBadge = {
      color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      text: "Menunggu Chat Grup",
    };
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[rgba(56,189,248,0.12)] text-[#38bdf8] border border-[rgba(56,189,248,0.2)]">
            <Activity size={20} />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[var(--text-1)]">
              Metrik & Alur Pesan
            </h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Statistik live alur masuk, filter pencegahan, dan pesan terkirim hari ini
            </p>
          </div>
        </div>

        <div className={`self-start sm:self-center inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${statusBadge.color}`}>
          <span>{statusBadge.text}</span>
        </div>
      </div>

      {/* Stage Cards (Grid 3 Kolom Rapi: 2 Baris x 3 Kartu) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Tahap 1: Didengar */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-3)] font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-sky-400">
                <Activity size={14} />
                1. Pesan Masuk
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono font-medium">
                100%
              </span>
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-1)] font-mono tracking-tight">
              {heard.toLocaleString()}
            </div>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-2">
            {heard > 0 ? "Pesan grup terpindai oleh bot" : "Belum ada obrolan masuk"}
          </p>
        </div>

        {/* Tahap 2: Cocok Keyword */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-3)] font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-violet-400">
                <Target size={14} />
                2. Cocok Kata Kunci
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono font-medium">
                {keywordRate}%
              </span>
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-1)] font-mono tracking-tight">
              {matched.toLocaleString()}
            </div>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-2">
            Pesan yang memuat kata kunci akun
          </p>
        </div>

        {/* Tahap 3: Dicegat Filter */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-3)] font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-amber-400">
                <ShieldAlert size={14} />
                3. Dicegat Filter
              </span>
              {blocked > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono font-medium">
                  {blocked} Disaring
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-1)] font-mono tracking-tight">
              {blocked.toLocaleString()}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
            <p className="text-xs text-[var(--text-3)]">
              Kata terlarang
            </p>
            {sortedBlockedReasons.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBlockedModal(true)}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline flex items-center gap-1"
                title="Lihat rincian kata apa saja yang mencegat pesan"
              >
                <ListFilter size={12} />
                Lihat Rincian
              </button>
            )}
          </div>
        </div>

        {/* Tahap 4: Dilewati Filter Lanjutan */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-3)] font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-purple-400">
                <Filter size={14} />
                4. Dilewati Filter
              </span>
              {skipped > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono font-medium">
                  {skipped} Dilewati
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-[var(--text-1)] font-mono tracking-tight">
              {skipped.toLocaleString()}
            </div>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-2">
            Target grup, pengirim, atau evaluasi AI
          </p>
        </div>

        {/* Tahap 5: Gagal Pengiriman */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-3)] font-semibold mb-2">
              <span className="flex items-center gap-1.5 text-rose-400">
                <XCircle size={14} />
                5. Gagal Kirim
              </span>
              {deliveryFailed > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-mono font-medium">
                  {deliveryFailed} Gagal
                </span>
              )}
            </div>
            <div className={`text-2xl font-extrabold font-mono tracking-tight ${deliveryFailed > 0 ? "text-rose-400" : "text-[var(--text-1)]"}`}>
              {deliveryFailed.toLocaleString()}
            </div>
          </div>
          <p className="text-xs text-[var(--text-3)] mt-2">
            {deliveryFailed > 0 ? "Tertahan rate-limit / izin grup" : "Antrean pengiriman lancar"}
          </p>
        </div>

        {/* Tahap 6: Sukses Terkirim */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold mb-2">
              <span className="flex items-center gap-1.5">
                <Send size={14} />
                6. Sukses Terkirim
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-medium">
                {sentRate}%
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono tracking-tight">
              {sent.toLocaleString()}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-emerald-500/20">
            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold" title="Pesan balasan otomatis hasil cocok keyword">
              {triggerCount} Trigger
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-semibold" title="Pesan siaran broadcast terjadwal">
              {broadcastCount} Broadcast
            </span>
          </div>
        </div>
      </div>

      {/* Visual Funnel Bar */}
      <div className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-2)] mb-3">
          <span className="font-semibold text-[var(--text-1)] flex items-center gap-1.5">
            <TrendingDown size={14} className="text-sky-400" />
            Alur Konversi Pesan:
          </span>
          <div className="flex items-center gap-3 text-[11px]">
            {slowmode > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                <Clock size={12} />
                Slowmode: {slowmode}x ditunda
              </span>
            )}
            {flood > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">
                <AlertTriangle size={12} />
                Flood wait: {flood}x
              </span>
            )}
          </div>
        </div>

        {/* Bar Pipeline */}
        <div className="flex items-center gap-2 text-[11px] font-mono overflow-x-auto py-1">
          <div className="flex-1 min-w-[120px] bg-sky-500/15 border border-sky-500/30 rounded-lg p-2.5 text-center">
            <div className="text-sky-400 font-bold text-xs">{heard.toLocaleString()}</div>
            <div className="text-[10px] text-[var(--text-3)] mt-0.5">Pesan Masuk</div>
          </div>
          <ArrowRight size={14} className="text-[var(--text-3)] shrink-0 opacity-60" />

          <div className="flex-1 min-w-[120px] bg-violet-500/15 border border-violet-500/30 rounded-lg p-2.5 text-center">
            <div className="text-violet-400 font-bold text-xs">{matched.toLocaleString()}</div>
            <div className="text-[10px] text-[var(--text-3)] mt-0.5">Cocok ({keywordRate}%)</div>
          </div>
          <ArrowRight size={14} className="text-[var(--text-3)] shrink-0 opacity-60" />

          <div className="flex-1 min-w-[120px] bg-amber-500/15 border border-amber-500/30 rounded-lg p-2.5 text-center">
            <div className="text-amber-400 font-bold text-xs">-{blocked.toLocaleString()}</div>
            <div className="text-[10px] text-[var(--text-3)] mt-0.5">Dicegat Filter</div>
          </div>
          <ArrowRight size={14} className="text-[var(--text-3)] shrink-0 opacity-60" />

          <div className="flex-1 min-w-[120px] bg-purple-500/15 border border-purple-500/30 rounded-lg p-2.5 text-center">
            <div className="text-purple-400 font-bold text-xs">-{skipped.toLocaleString()}</div>
            <div className="text-[10px] text-[var(--text-3)] mt-0.5">Dilewati Filter</div>
          </div>
          
          {deliveryFailed > 0 && (
            <>
              <ArrowRight size={14} className="text-[var(--text-3)] shrink-0 opacity-60" />
              <div className="flex-1 min-w-[120px] bg-rose-500/15 border border-rose-500/30 rounded-lg p-2.5 text-center">
                <div className="text-rose-400 font-bold text-xs">-{deliveryFailed.toLocaleString()}</div>
                <div className="text-[10px] text-[var(--text-3)] mt-0.5">Gagal Kirim</div>
              </div>
            </>
          )}

          <ArrowRight size={14} className="text-[var(--text-3)] shrink-0 opacity-60" />

          <div className="flex-1 min-w-[130px] bg-emerald-500/15 border border-emerald-500/30 rounded-lg p-2.5 text-center">
            <div className="text-emerald-400 font-bold text-xs">{sent.toLocaleString()} Sukses</div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">
              {triggerCount} Trigger | {broadcastCount} Broadcast
            </div>
          </div>
        </div>
      </div>

      {/* Smart Advice Section */}
      {smartAdvice.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-1)]">
            <Lightbulb size={15} className="text-amber-400" />
            <span>Rekomendasi Pintar:</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {smartAdvice.map((advice, idx) => {
              let badgeStyle = "bg-sky-500/10 text-sky-400 border-sky-500/20";
              let Icon = Info;

              if (advice.type === "warning") {
                badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                Icon = AlertTriangle;
              } else if (advice.type === "tip") {
                badgeStyle = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                Icon = Sparkles;
              } else if (advice.type === "success") {
                badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                Icon = CheckCircle2;
              }

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border ${badgeStyle} flex items-start gap-3 transition-all hover:bg-opacity-20`}
                >
                  <Icon size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <h4 className="text-xs font-bold">{advice.title}</h4>
                    <p className="text-[11px] leading-relaxed opacity-90">{advice.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL BREAKDOWN KATA TERLARANG */}
      {showBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-[var(--text-1)]">
                  Rincian Kata Terlarang (Filter Words)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBlockedModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)] transition"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-2)] leading-relaxed">
              Daftar kata terlarang yang paling sering mencegat pesan yang sudah cocok kata kunci hari ini:
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {sortedBlockedReasons.map(([word, count]) => {
                const percentage = blocked > 0 ? ((count / blocked) * 100).toFixed(1) : "0.0";
                return (
                  <div
                    key={word}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs"
                  >
                    <span className="font-mono font-bold text-amber-400">
                      "{word}"
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-[var(--text-1)] font-bold">
                        {count.toLocaleString()}x
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono font-medium">
                        {percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
              {sortedBlockedReasons.length === 0 && (
                <p className="text-xs text-[var(--text-3)] text-center py-4 italic">
                  Belum ada rincian kata terlarang yang tercatat hari ini.
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={() => setShowBlockedModal(false)}
                className="px-4 py-2 rounded-xl bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-1)] hover:bg-[var(--surface-3)] transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
