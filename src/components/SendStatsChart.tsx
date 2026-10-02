// src/components/SendStatsChart.tsx
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { DailyStatEntry } from "../types";

export default function SendStatsChart({ 
  data, accounts = [], selectedAccount = "all", onAccountChange 
}: { 
  data: DailyStatEntry[]; accounts?: string[]; selectedAccount?: string; onAccountChange?: (acc: string) => void; 
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="cyber-card accent-top p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Statistik Pengiriman</span>
        </div>
        <p className="text-sm text-center py-8" style={{ color: "var(--text-3)" }}>Belum ada data pengiriman...</p>
      </div>
    );
  }

  const W = 600; const H = 200; const PAD_L = 40; const PAD_R = 16; const PAD_T = 20; const PAD_B = 36;
  const chartW = W - PAD_L - PAD_R; const chartH = H - PAD_T - PAD_B;
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.success, d.failed)));
  const yTicks = 4;
  const toX = (i: number) => PAD_L + (chartW / Math.max(data.length - 1, 1)) * i;
  const toY = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;

  const buildPath = (key: "success" | "failed") => data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d[key]).toFixed(1)}`).join(" ");
  const buildAreaPath = (key: "success" | "failed") => `${buildPath(key)} L ${toX(data.length - 1).toFixed(1)} ${(PAD_T + chartH).toFixed(1)} L ${PAD_L.toFixed(1)} ${(PAD_T + chartH).toFixed(1)} Z`;

  const successPath = buildPath("success"); const failedPath = buildPath("failed");
  const successAreaPath = buildAreaPath("success"); const failedAreaPath = buildAreaPath("failed");
  const totalSuccess = data.reduce((s, d) => s + d.success, 0);
  const totalFailed = data.reduce((s, d) => s + d.failed, 0);

  const formatDate = (dateStr: string) => new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" });

  return (
    <div className="cyber-card accent-top p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} style={{ color: "var(--accent)" }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Statistik Pengiriman (7 Hari)</span>
          </div>
          {accounts.length > 0 && onAccountChange && (
            <select className="stats-account-select" value={selectedAccount} onChange={(e) => onAccountChange(e.target.value)}>
              <option value="all">Semua Akun</option>
              {accounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px] hidden sm:flex">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.5)" }} /><span style={{ color: "var(--text-2)" }}>Berhasil ({totalSuccess})</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#fb7185", boxShadow: "0 0 6px rgba(251,113,133,0.5)" }} /><span style={{ color: "var(--text-2)" }}>Gagal ({totalFailed})</span></span>
        </div>
      </div>

      <div className="w-full overflow-hidden" style={{ minHeight: 200 }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 220 }} onMouseLeave={() => setHoveredIdx(null)}>
          <defs>
            <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(52,211,153,0.25)" /><stop offset="100%" stopColor="rgba(52,211,153,0)" /></linearGradient>
            <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(251,113,133,0.15)" /><stop offset="100%" stopColor="rgba(251,113,133,0)" /></linearGradient>
            <filter id="glowSuccess"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="glowFailed"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const y = PAD_T + (chartH / yTicks) * i;
            const val = Math.round(maxVal - (maxVal / yTicks) * i);
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
                <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="JetBrains Mono, monospace">{val}</text>
              </g>
            );
          })}

          {data.map((d, i) => <text key={d.date} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-3)" fontFamily="JetBrains Mono, monospace">{formatDate(d.date)}</text>)}
          <path d={successAreaPath} fill="url(#successGrad)" />
          <path d={failedAreaPath} fill="url(#failedGrad)" />
          <path d={successPath} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" filter="url(#glowSuccess)" />
          <path d={failedPath} fill="none" stroke="#fb7185" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4,3" filter="url(#glowFailed)" />

          {data.map((d, i) => (
            <g key={d.date}>
              <circle cx={toX(i)} cy={toY(d.success)} r={hoveredIdx === i ? 5 : 3} fill="#34d399" stroke="var(--bg-card)" strokeWidth="1.5" style={{ filter: hoveredIdx === i ? "drop-shadow(0 0 6px rgba(52,211,153,0.8))" : "none", transition: "r 0.15s ease" }} />
              {d.failed > 0 && <circle cx={toX(i)} cy={toY(d.failed)} r={hoveredIdx === i ? 4.5 : 2.5} fill="#fb7185" stroke="var(--bg-card)" strokeWidth="1.5" style={{ filter: hoveredIdx === i ? "drop-shadow(0 0 6px rgba(251,113,133,0.8))" : "none", transition: "r 0.15s ease" }} />}
              <rect x={toX(i) - chartW / data.length / 2} y={PAD_T} width={chartW / data.length} height={chartH} fill="transparent" onMouseEnter={() => setHoveredIdx(i)} />
            </g>
          ))}

          {hoveredIdx !== null && data[hoveredIdx] && (
            <g>
              <line x1={toX(hoveredIdx)} y1={PAD_T} x2={toX(hoveredIdx)} y2={PAD_T + chartH} stroke="var(--accent)" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.5" />
              <rect x={toX(hoveredIdx) - 52} y={Math.max(PAD_T, toY(Math.max(data[hoveredIdx].success, data[hoveredIdx].failed)) - 48)} width="104" height="42" rx="6" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.5" opacity="0.95" />
              <text x={toX(hoveredIdx)} y={Math.max(PAD_T, toY(Math.max(data[hoveredIdx].success, data[hoveredIdx].failed)) - 48) + 16} textAnchor="middle" fontSize="10" fill="#34d399" fontWeight="600" fontFamily="JetBrains Mono, monospace">✓ {data[hoveredIdx].success} berhasil</text>
              <text x={toX(hoveredIdx)} y={Math.max(PAD_T, toY(Math.max(data[hoveredIdx].success, data[hoveredIdx].failed)) - 48) + 32} textAnchor="middle" fontSize="10" fill="#fb7185" fontWeight="600" fontFamily="JetBrains Mono, monospace">✗ {data[hoveredIdx].failed} gagal</text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}