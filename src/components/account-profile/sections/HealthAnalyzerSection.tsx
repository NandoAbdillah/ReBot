import React from "react";
import { Shield, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { HealthInfo } from "../types";

export interface HealthAnalyzerSectionProps {
  healthInfo: HealthInfo | null;
  checkingHealth: boolean;
  fetchHealth: () => void;
}

export function HealthAnalyzerSection({
  healthInfo,
  checkingHealth,
  fetchHealth,
}: HealthAnalyzerSectionProps) {
  return (
    <div className="cyber-card accent-top p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-theme pb-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-1">Analisis Kesehatan Bot</h3>
        </div>
        <button
          onClick={fetchHealth}
          disabled={checkingHealth}
          className="text-xs text-accent hover:underline flex items-center gap-1 disabled:opacity-50"
        >
          {checkingHealth ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Menganalisis...
            </>
          ) : (
            "Periksa Ulang"
          )}
        </button>
      </div>

      {healthInfo ? (
        <div className="space-y-3">
          {/* Status and Latency (Ping) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-card border border-theme rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-3 uppercase font-semibold">Status Bot</span>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    healthInfo.status === "healthy"
                      ? "bg-[#10b981]"
                      : healthInfo.status === "needs_otp"
                      ? "bg-[#f59e0b]"
                      : healthInfo.status === "banned"
                      ? "bg-[#f43f5e]"
                      : "bg-[#ef4444]"
                  }`}
                />
                <span className="text-xs font-bold text-1 capitalize">
                  {healthInfo.status === "healthy"
                    ? "Sehat / Aktif"
                    : healthInfo.status === "needs_otp"
                    ? "Butuh OTP"
                    : healthInfo.status === "banned"
                    ? "Banned / Blokir"
                    : "Koneksi Terputus"}
                </span>
              </div>
            </div>

            <div className="p-3 bg-card border border-theme rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-3 uppercase font-semibold">Ping Latency</span>
              <span className="text-xs font-bold text-1 mt-1">
                {healthInfo.ping !== null && healthInfo.ping !== undefined ? `${healthInfo.ping} ms` : "-"}
              </span>
            </div>

            <div className="p-3 bg-card border border-theme rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-3 uppercase font-semibold">Tipe Koneksi</span>
              <span className="text-xs font-bold text-1 mt-1">
                {healthInfo.connected ? "GramJS Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          {/* Anomalies List */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-2">Hasil Diagnosa & Anomali:</h4>
            {healthInfo.anomalies && healthInfo.anomalies.length > 0 ? (
              <div className="space-y-1.5">
                {healthInfo.anomalies.map((anomaly: string, index: number) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-xs px-3 py-2 bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.15)] rounded-lg text-[#f59e0b]"
                  >
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    <span>{anomaly}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs px-3 py-2 bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.15)] rounded-lg text-[#34d399]">
                <CheckCircle2 size={13} className="shrink-0" />
                <span>Tidak ada anomali terdeteksi. Bot berfungsi optimal.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-3 italic">Menunggu hasil analisis...</p>
      )}
    </div>
  );
}
export default HealthAnalyzerSection;
