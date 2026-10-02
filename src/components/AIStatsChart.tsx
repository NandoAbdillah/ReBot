// src/components/AIStatsChart.tsx
import { useState } from "react";
import { BarChart3 } from "lucide-react";

export interface AIChartKeyData {
  date: string;
  dateKey: string;
  keys: {
    [keyName: string]: number;
  };
  total: number;
}

const KEY_COLORS = [
  "#34d399", // Emerald
  "#6366f1", // Indigo
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#a855f7", // Purple
  "#ef4444", // Red
  "#3b82f6", // Blue
];

export default function AIStatsChart({ data }: { data: AIChartKeyData[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="cyber-card accent-top p-5 w-full">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-accent" />
          <span className="text-sm font-bold text-1">Aktivitas Intent AI (7 Hari)</span>
        </div>
        <p className="text-sm text-center py-10" style={{ color: "var(--text-3)" }}>
          Belum ada data aktivitas AI...
        </p>
      </div>
    );
  }

  // Konfigurasi Ukuran & Padding
  const W = 600;
  const H = 200;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 20;
  const PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Kalkulasi Skala Y (Batas minimal 10 agar grafik tidak terlalu flat)
  const maxVal = Math.max(10, ...data.map((d) => d.total));
  const yTicks = 4;

  const toX = (i: number) => PAD_L + (chartW / Math.max(data.length - 1, 1)) * i;
  const toY = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;

  const totalCount = data.reduce((s, d) => s + d.total, 0);

  // Ambil semua nama API Key unik dari dataset (selain total)
  const keyNames = Array.from(
    new Set(data.flatMap((d) => Object.keys(d.keys)))
  ).filter((name) => name !== "total");

  // Jika tidak ada key terdaftar, fallback ke rendering satu line "Total"
  const linesToDraw = keyNames.length > 0 ? keyNames : ["Total"];

  // Tooltip calculations
  const hoveredData = hoveredIdx !== null ? data[hoveredIdx] : null;
  const tooltipW = 150;
  const lineH = 13;

  let tooltipX = 0;
  let tooltipY = 0;
  let tooltipH = 0;
  let tooltipItems: { name: string; val: number; color: string }[] = [];

  if (hoveredIdx !== null && hoveredData) {
    tooltipItems = linesToDraw.map((keyName, idx) => {
      const val = keyName === "Total" ? hoveredData.total : (hoveredData.keys[keyName] || 0);
      const color = KEY_COLORS[idx % KEY_COLORS.length];
      return { name: keyName, val, color };
    });

    // 20px header, items, 10px separator, 15px total, 10px padding
    tooltipH = 20 + tooltipItems.length * lineH + 20;

    const rawX = toX(hoveredIdx);
    tooltipX = rawX - tooltipW / 2;
    if (tooltipX < PAD_L) {
      tooltipX = PAD_L;
    } else if (tooltipX + tooltipW > W - PAD_R) {
      tooltipX = W - PAD_R - tooltipW;
    }

    // Diposisikan di atas titik tertinggi
    tooltipY = Math.max(PAD_T, toY(hoveredData.total) - tooltipH - 8);
  }

  return (
    <div className="cyber-card accent-top p-5 sm:p-7 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-theme pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-accent" />
          <h3 className="text-base font-bold text-1">Statistik Penggunaan AI (7 Hari)</h3>
        </div>

        {/* Legend Dinamis Multi-Key */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs">
          {linesToDraw.map((keyName, idx) => {
            const keyColor = KEY_COLORS[idx % KEY_COLORS.length];
            const keyTotal = data.reduce(
              (sum, d) => sum + (keyName === "Total" ? d.total : (d.keys[keyName] || 0)),
              0
            );
            return (
              <span key={keyName} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background: keyColor,
                    boxShadow: `0 0 5px ${keyColor}`,
                  }}
                />
                <span style={{ color: "var(--text-2)" }}>
                  {keyName}: <strong>{keyTotal}</strong>
                </span>
              </span>
            );
          })}
          <span className="flex items-center gap-1.5 border-l border-theme pl-3 ml-1">
            <span style={{ color: "var(--text-1)", fontWeight: "bold" }}>
              Total: {totalCount}
            </span>
          </span>
        </div>
      </div>

      <div className="w-full overflow-hidden" style={{ minHeight: 200 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          style={{ maxHeight: 250 }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {/* Grid Garis Horizontal */}
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const y = PAD_T + (chartH / yTicks) * i;
            const val = Math.round(maxVal - (maxVal / yTicks) * i);
            return (
              <g key={i}>
                <line
                  x1={PAD_L}
                  y1={y}
                  x2={W - PAD_R}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth="0.5"
                  strokeDasharray="3,3"
                />
                <text
                  x={PAD_L - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--text-3)"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Label Tanggal X-Axis */}
          {data.map((d, i) => (
            <text
              key={i}
              x={toX(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-3)"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.date}
            </text>
          ))}

          {/* Grafik Lines & Areas */}
          {linesToDraw.map((keyName, idx) => {
            const keyColor = KEY_COLORS[idx % KEY_COLORS.length];

            const pathData = data
              .map((d, i) => {
                const val = keyName === "Total" ? d.total : (d.keys[keyName] || 0);
                return `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(val).toFixed(1)}`;
              })
              .join(" ");

            const showArea = linesToDraw.length === 1;
            const areaPath = showArea
              ? `${pathData} L ${toX(data.length - 1).toFixed(1)} ${(PAD_T + chartH).toFixed(1)} L ${PAD_L.toFixed(1)} ${(PAD_T + chartH).toFixed(1)} Z`
              : null;

            return (
              <g key={keyName}>
                {showArea && (
                  <>
                    <defs>
                      <linearGradient id={`areaGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={keyColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={keyColor} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={areaPath!} fill={`url(#areaGrad-${idx})`} />
                  </>
                )}

                <path
                  d={pathData}
                  fill="none"
                  stroke={keyColor}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 3px ${keyColor}40)` }}
                />

                {/* Titik Data Bulat */}
                {data.map((d, i) => {
                  const val = keyName === "Total" ? d.total : (d.keys[keyName] || 0);
                  return (
                    <circle
                      key={i}
                      cx={toX(i)}
                      cy={toY(val)}
                      r={hoveredIdx === i ? 4.5 : 2.5}
                      fill={keyColor}
                      stroke="var(--bg-card)"
                      strokeWidth="1.2"
                      style={{
                        transition: "r 0.1s ease",
                        filter: hoveredIdx === i ? `drop-shadow(0 0 4px ${keyColor})` : "none",
                      }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Invisible Hover Rects for trigger */}
          {data.map((d, i) => (
            <rect
              key={i}
              x={toX(i) - chartW / data.length / 2}
              y={PAD_T}
              width={chartW / data.length}
              height={chartH}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoveredIdx(i)}
            />
          ))}

          {/* Tooltip Hover Box */}
          {hoveredIdx !== null && hoveredData && (
            <g style={{ pointerEvents: "none" }}>
              {/* Vertical line indicator */}
              <line
                x1={toX(hoveredIdx)}
                y1={PAD_T}
                x2={toX(hoveredIdx)}
                y2={PAD_T + chartH}
                stroke="var(--border)"
                strokeWidth="0.8"
                strokeDasharray="3,3"
                opacity="0.6"
              />

              {/* Tooltip Card */}
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipW}
                height={tooltipH}
                rx="6"
                fill="var(--bg-card)"
                stroke="var(--border)"
                strokeWidth="1"
                opacity="0.97"
                style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))" }}
              />

              {/* Date Header */}
              <text
                x={tooltipX + tooltipW / 2}
                y={tooltipY + 13}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="bold"
                fill="var(--text-1)"
                fontFamily="JetBrains Mono, monospace"
              >
                {hoveredData.date}
              </text>

              {/* Items list */}
              {tooltipItems.map((item, idx) => {
                const textY = tooltipY + 26 + idx * lineH;
                return (
                  <g key={item.name}>
                    <circle
                      cx={tooltipX + 12}
                      cy={textY - 3}
                      r={2.5}
                      fill={item.color}
                    />
                    <text
                      x={tooltipX + 20}
                      y={textY}
                      fontSize="8.5"
                      fill="var(--text-2)"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {item.name.length > 15 ? `${item.name.substring(0, 13)}..` : item.name}:
                    </text>
                    <text
                      x={tooltipX + tooltipW - 12}
                      y={textY}
                      textAnchor="end"
                      fontSize="8.5"
                      fontWeight="bold"
                      fill="var(--text-1)"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {item.val}
                    </text>
                  </g>
                );
              })}

              {/* Separator Line */}
              <line
                x1={tooltipX + 8}
                y1={tooltipY + tooltipH - 15}
                x2={tooltipX + tooltipW - 8}
                y2={tooltipY + tooltipH - 15}
                stroke="var(--border)"
                strokeWidth="0.5"
                opacity="0.5"
              />

              {/* Total Summary */}
              <text
                x={tooltipX + 12}
                y={tooltipY + tooltipH - 5}
                fontSize="9"
                fontWeight="bold"
                fill="var(--text-1)"
                fontFamily="JetBrains Mono, monospace"
              >
                Total:
              </text>
              <text
                x={tooltipX + tooltipW - 12}
                y={tooltipY + tooltipH - 5}
                textAnchor="end"
                fontSize="9"
                fontWeight="bold"
                fill="var(--text-1)"
                fontFamily="JetBrains Mono, monospace"
              >
                {hoveredData.total}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}