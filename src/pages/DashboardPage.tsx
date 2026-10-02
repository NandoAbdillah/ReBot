// src/pages/DashboardPage.tsx
import { useRef, useState } from "react";
import { Plus, Users, Activity, Send, MessageSquare, AlertTriangle, Download, Upload, Check, AlertCircle } from "lucide-react";
import SendStatsChart from "../components/SendStatsChart";
import CertaintyFunnelWidget from "../components/CertaintyFunnelWidget";
import { StatCard, AccountCard, EmptyState } from "../components/DashboardWidgets";
import { AccountStatus, StatsData, FloodAlert, Log } from "../types";

interface DashboardPageProps {
  accounts: AccountStatus[];
  connectedCount: number;
  floodAlerts: FloodAlert[];
  statsData: StatsData | null;
  logs: Log[];
  statsAccountFilter: string;
  setStatsAccountFilter: (acc: string) => void;
  isAllActive: boolean;
  handleToggleAll: () => void;
  isToggling: boolean;
  setShowAddForm: (show: boolean) => void;
  resetForm: () => void;
  navigate: (path: string) => void;
  onExportAll?: () => void;
  onImportAll?: (file: File) => Promise<{ success: boolean; message?: string }>;
}

export default function DashboardPage({
  accounts,
  connectedCount,
  floodAlerts,
  statsData,
  logs,
  statsAccountFilter,
  setStatsAccountFilter,
  isAllActive,
  handleToggleAll,
  isToggling,
  setShowAddForm,
  resetForm,
  navigate,
  onExportAll,
  onImportAll,
}: DashboardPageProps) {
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportAll) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await onImportAll(file);
      if (res.success) {
        setImportMsg({ type: "success", text: res.message || "Seluruh konfigurasi berhasil diimpor!" });
        setTimeout(() => setImportMsg(null), 5000);
      } else {
        setImportMsg({ type: "error", text: res.message || "Gagal mengimpor konfigurasi" });
      }
    } catch (err: any) {
      setImportMsg({ type: "error", text: `Error: ${err.message}` });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-7">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold" style={{ color: "var(--text-1)" }}>
              Dashboard
            </h1>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
              {connectedCount} dari {accounts.length} akun terhubung
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Button Ekspor Seluruh Konfigurasi */}
            {onExportAll && (
              <button
                type="button"
                onClick={onExportAll}
                className="btn-accent flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition"
                title="Ekspor seluruh akun, keyword, filter, AI prompt, dan settings dalam 1 file JSON"
              >
                <Download size={14} />
                <span>Ekspor Seluruh Konfigurasi</span>
              </button>
            )}

            {/* Button Impor Seluruh Konfigurasi */}
            {onImportAll && (
              <>
                <button
                  type="button"
                  onClick={() => globalFileInputRef.current?.click()}
                  disabled={importing}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition"
                  title="Impor paket seluruh konfigurasi dari file backup"
                >
                  <Upload size={14} />
                  <span>{importing ? "Mengimpor..." : "Impor Seluruh Konfigurasi"}</span>
                </button>
                <input
                  ref={globalFileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </>
            )}

            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="btn-accent flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm"
            >
              <Plus size={14} />
              <span>Tambah Akun</span>
            </button>
          </div>
        </div>

        {/* Global Import Notification Banner */}
        {importMsg && (
          <div
            className={`p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium border ${
              importMsg.type === "success"
                ? "bg-[rgba(16,185,129,0.1)] text-[#34d399] border-[rgba(16,185,129,0.2)]"
                : "bg-[rgba(244,63,94,0.1)] text-[#fb7185] border-[rgba(244,63,94,0.2)]"
            }`}
          >
            {importMsg.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{importMsg.text}</span>
          </div>
        )}

        {/* Flood Alerts */}
        {floodAlerts.length > 0 && (
          <div className="flex flex-col gap-2">
            {floodAlerts.map((alert) => (
              <div key={alert.accountId} className="flood-alert-banner flex items-center gap-3">
                <AlertTriangle size={18} style={{ color: "#ef4444" }} className="shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Limit Telegram Terdeteksi</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                    Akun <span className="font-bold text-1">{alert.accountId}</span> terkena flood wait. Sisa waktu:{" "}
                    <span className="font-bold text-rose-400">{Math.ceil((alert.until - Date.now()) / 1000)}</span> detik.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={<Users size={16} />} label="Total Akun" value={accounts.length} />
          <StatCard icon={<Activity size={16} />} label="Terhubung" value={connectedCount} />
          <StatCard
            icon={<Send size={16} />}
            label="Terkirim Hari Ini"
            value={statsData?.today?.success ?? 0}
            subBadges={
              <>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono"
                  title="Subtotal pesan balasan otomatis yang terpicu dari keyword"
                >
                  {statsData?.today?.triggerSuccess ?? Math.max(0, (statsData?.today?.success ?? 0) - (statsData?.today?.broadcastSuccess ?? 0))} Trigger
                </span>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono"
                  title="Subtotal pesan siaran iklan terjadwal dari broadcaster"
                >
                  {statsData?.today?.broadcastSuccess ?? 0} Broadcast
                </span>
              </>
            }
          />
          <StatCard icon={<MessageSquare size={16} />} label="Log Masuk" value={logs.length} />
        </div>

        {/* Certainty Funnel & Traffic Radar */}
        <CertaintyFunnelWidget
          funnel={statsData?.funnelToday}
          todaySuccess={statsData?.today?.success ?? 0}
          smartAdvice={statsData?.smartAdvice}
          connectedCount={connectedCount}
          totalAccounts={accounts.length}
        />

        {/* Chart */}
        <SendStatsChart
          data={statsData?.daily ?? []}
          accounts={statsData?.accounts ?? []}
          selectedAccount={statsAccountFilter}
          onAccountChange={setStatsAccountFilter}
        />

        {/* Account List */}
        {accounts.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-[1px]" style={{ background: "var(--accent-gradient)" }} />
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Akun Anda
                </h2>
                <div className="flex-1 h-[1px]" style={{ background: "var(--border)" }} />
              </div>
              <button
                onClick={handleToggleAll}
                disabled={isToggling}
                className="btn-ghost relative flex items-center justify-center px-3 sm:px-4 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: isAllActive ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.2)",
                  color: isAllActive ? "#fb7185" : "#34d399",
                }}
              >
                <span className={`flex items-center gap-1.5 transition-all duration-300 ${isToggling ? "scale-0 opacity-0" : "scale-100 opacity-100"}`}>
                  {isAllActive ? "■ Stop All" : "▶ Start All"}
                </span>
                {isToggling && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((acc) => (
                <AccountCard
                  key={acc.accountId}
                  account={acc}
                  onClick={() => navigate(`/account/${encodeURIComponent(acc.accountId)}`)}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState onAdd={() => { resetForm(); setShowAddForm(true); }} />
        )}
      </div>
    </div>
  );
}