// src/pages/InspectPage.tsx
import { useState, useEffect } from "react";
import {
  Server,
  Activity,
  Clock,
  HardDrive,
  Cpu,
  Download,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sliders,
  Layers,
  Zap,
  Send,
  Loader2,
} from "lucide-react";
import { BRANDING } from "../config/branding.js";

interface InspectData {
  success: boolean;
  overallStatus: "healthy" | "warning" | "critical";
  deploymentType: string;
  railwayMeta: {
    isRailway: boolean;
    environmentName: string;
    projectId: string;
    projectName: string;
    serviceId: string;
    serviceName: string;
    deploymentId: string;
    snapshotId: string | null;
    publicDomain: string | null;
    region: string;
    git: {
      repo: string | null;
      branch: string | null;
      commitSha: string | null;
      commitMessage: string | null;
      author: string | null;
    };
  };
  trial: {
    status: "safe" | "warning" | "critical";
    trialStartDate: string;
    trialDurationDays: number;
    totalCreditLimit: number;
    remainingDays: number;
    remainingHours: number;
    elapsedDays: number;
    elapsedHours: number;
    estimatedCreditUsed: number;
    estimatedCreditRemaining: number;
    expirationDate: string;
    lastAutoTelegramBackupDate: string | null;
  };
  system: {
    uptimeSeconds: number;
    uptimeFormatted: string;
    serverStartTime: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    pid: number;
    cpuCores: number;
    cpuModel: string;
    loadAvg: number[];
    memory: {
      rssMB: number;
      heapUsedMB: number;
      heapTotalMB: number;
      systemTotalMB: number;
      systemFreeMB: number;
      systemUsedMB: number;
      systemMemoryPercent: number;
    };
  };
  storage: {
    dataDir: string;
    isPersistentVolume: boolean;
    dbFilesSizeBytes: number;
    dbFilesSizeFormatted: string;
    accountsCount: number;
    connectedAccountsCount: number;
  };
  network: {
    telegramDC5: {
      targetIp: string;
      port: number;
      ok: boolean;
      latencyMs: number;
      error: string | null;
      note: string;
    };
  };
}

interface InspectPageProps {
  onExportAll?: () => void;
  navigate: (path: string) => void;
}

export default function InspectPage({ onExportAll }: InspectPageProps) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time live countdown timer (ticking every 1 second)
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Telegram Send Backup State
  const [sendingTg, setSendingTg] = useState(false);
  const [tgResultMsg, setTgResultMsg] = useState<string | null>(null);
  const [tgErrorMsg, setTgErrorMsg] = useState<string | null>(null);

  // Kalibrasi form state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [startDateInput, setStartDateInput] = useState("");
  const [durationInput, setDurationInput] = useState(21);
  const [creditInput, setCreditInput] = useState(5.0);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  const fetchInspect = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/deployment/inspect");
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json: InspectData = await res.json();
      setData(json);
      setError(null);

      // Pre-fill modal fields
      if (json?.trial) {
        if (json.trial.trialStartDate) {
          const d = new Date(json.trial.trialStartDate);
          const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
          setStartDateInput(localIso);
        }
        setDurationInput(json.trial.trialDurationDays || 21);
        setCreditInput(json.trial.totalCreditLimit || 5.0);
      }
    } catch (err: any) {
      setError(err.message || "Gagal memuat status deployment");
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInspect();
    const fetchInterval = setInterval(() => {
      fetchInspect();
    }, 15000); // Polling data background setiap 15 detik

    const tickInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000); // Realtime clock tick setiap 1 detik

    return () => {
      clearInterval(fetchInterval);
      clearInterval(tickInterval);
    };
  }, []);

  const handleSendBackupToTelegram = async () => {
    setSendingTg(true);
    setTgResultMsg(null);
    setTgErrorMsg(null);
    try {
      const res = await fetch("/api/deployment/send-backup-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "Gagal mengirim backup ke Telegram.");
      }
      setTgResultMsg(`Cadangan berhasil dikirim ke Pesan Tersimpan (${resData.sentCount} akun aktif).`);
      setTimeout(() => setTgResultMsg(null), 7000);
      await fetchInspect();
    } catch (err: any) {
      setTgErrorMsg(err.message || "Gagal mengirim cadangan ke Telegram.");
    } finally {
      setSendingTg(false);
    }
  };

  const handleQuickCalibrate = async (days: number, credit?: number) => {
    setSavingConfig(true);
    try {
      const payload: any = { remainingDays: days };
      if (credit !== undefined) {
        payload.remainingCredit = credit;
      }
      const res = await fetch("/api/deployment/inspect/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal melakukan kalibrasi");
      await fetchInspect();
    } catch (err: any) {
      alert(`Kalibrasi gagal: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSaveSuccessMsg(false);
    try {
      const payload: any = {
        trialDurationDays: Number(durationInput),
        trialCreditLimit: Number(creditInput),
      };
      if (startDateInput) {
        payload.trialStartDate = new Date(startDateInput).toISOString();
      }

      const res = await fetch("/api/deployment/inspect/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Gagal menyimpan konfigurasi");
      setSaveSuccessMsg(true);
      setTimeout(() => {
        setSaveSuccessMsg(false);
        setShowConfigModal(false);
      }, 1500);
      await fetchInspect();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Helper formatting waktu tanggal Indonesia
  const formatDateWIB = (isoStr: string) => {
    if (!isoStr) return "-";
    try {
      return new Date(isoStr).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB";
    } catch {
      return isoStr;
    }
  };

  // Helper live countdown ticker
  const calculateLiveCountdown = (expirationDateStr?: string) => {
    if (!expirationDateStr) return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false };
    const expTime = new Date(expirationDateStr).getTime();
    const diff = expTime - currentTime;
    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds, isExpired: false };
  };

  if (loading && !data) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-7 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="animate-spin text-[var(--accent)]" size={32} />
        <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
          Mengambil data inspeksi Railway & container...
        </p>
      </div>
    );
  }

  const trial = data?.trial;
  const system = data?.system;
  const railway = data?.railwayMeta;
  const storage = data?.storage;
  const network = data?.network;

  const countdown = calculateLiveCountdown(trial?.expirationDate);

  // Persentase pemakaian trial
  const trialUsedPercent = trial
    ? Math.min(100, Math.round((trial.elapsedDays / trial.trialDurationDays) * 100))
    : 0;
  const trialRemainingPercent = Math.max(0, 100 - trialUsedPercent);

  // Status visual badge
  const trialBadge =
    trial?.status === "critical"
      ? { label: "SEGERA PINDAH DEPLOYMENT", bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.4)" }
      : trial?.status === "warning"
      ? { label: "TRIAL MENIPIS", bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.4)" }
      : { label: "TRIAL AKTIF NORMAL", bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", border: "rgba(16, 185, 129, 0.4)" };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-7 space-y-6">
      {/* ─── HEADER UTAMA ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
              Railway & Deployment Inspect
            </h1>
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5"
              style={{
                background: railway?.isRailway ? "rgba(139, 92, 246, 0.15)" : "rgba(59, 130, 246, 0.15)",
                color: railway?.isRailway ? "#a78bfa" : "#60a5fa",
                border: railway?.isRailway ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)",
              }}
            >
              <Server size={12} />
              {railway?.isRailway ? "Railway Cloud" : "Local / Self-Hosted"}
            </span>
          </div>
          <p className="text-xs sm:text-sm mt-1" style={{ color: "var(--text-3)" }}>
            Hitung mundur waktu aktif trial realtime, cadangan otomatis ke Telegram, dan kesiapan migrasi antar-server.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tombol Backup Migrasi Cepat */}
          {onExportAll && (
            <button
              onClick={onExportAll}
              className="btn-accent flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition hover:scale-[1.02]"
              title="Unduh full backup untuk persiapan pindah deployan Railway baru"
            >
              <Download size={14} />
              <span>Unduh Full Backup</span>
            </button>
          )}

          {/* Tombol Refresh */}
          <button
            onClick={() => fetchInspect(true)}
            disabled={refreshing}
            className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs font-medium"
            title="Muat ulang diagnostik sekarang"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── ALERT BANNER SISA TRIAL ─── */}
      {trial && (trial.status === "warning" || trial.status === "critical") && (
        <div
          className="p-4 rounded-xl flex items-start gap-3.5 border transition-all"
          style={{
            background: trial.status === "critical" ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)",
            borderColor: trial.status === "critical" ? "rgba(239, 68, 68, 0.3)" : "rgba(245, 158, 11, 0.3)",
          }}
        >
          <AlertTriangle
            size={22}
            className="shrink-0 mt-0.5"
            style={{ color: trial.status === "critical" ? "#ef4444" : "#f59e0b" }}
          />
          <div className="flex-1 min-w-0">
            <h4
              className="text-sm font-bold tracking-tight mb-1"
              style={{ color: trial.status === "critical" ? "#ef4444" : "#f59e0b" }}
            >
              {trial.status === "critical"
                ? `PERINGATAN KRITIS: Trial Railway Tersisa ${trial.remainingDays} Hari Lagi`
                : `PERHATIAN: Sisa Masa Aktif Trial Menipis (${trial.remainingDays} Hari Tersisa)`}
            </h4>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
              Estimasi trial habis pada <strong>{formatDateWIB(trial.expirationDate)}</strong>. File cadangan telah disiapkan. Klik tombol{" "}
              <strong>"Kirim Backup ke Telegram"</strong> atau <strong>"Unduh Full Backup"</strong>, lalu impor ke akun Railway baru agar bot tidak terputus.
            </p>
          </div>
        </div>
      )}

      {/* ─── KARTU UTAMA 1: HITUNG MUNDUR REALTIME & SISA TRIAL ─── */}
      <div className="cyber-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg" style={{ background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" }}>
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--text-1)" }}>
                Hitung Mundur Masa Aktif & Saldo Railway
              </h2>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Waktu sisa berjalan realtime per detik dan sinkronisasi kuota pemakaian.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-1 rounded-md text-xs font-bold tracking-wider uppercase"
              style={{
                background: trialBadge.bg,
                color: trialBadge.text,
                border: `1px solid ${trialBadge.border}`,
              }}
            >
              {trialBadge.label}
            </span>

            <button
              onClick={() => setShowConfigModal(true)}
              className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
              title="Atur tanggal mulai & kuota trial"
            >
              <Sliders size={13} />
              <span>Kalibrasi Lengkap</span>
            </button>
          </div>
        </div>

        {/* Realtime Live Countdown Digits Ticker */}
        {trial && (
          <div className="p-4 rounded-xl border bg-black/20 space-y-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Sisa Waktu Nyata (Real-time Live Countdown)
              </span>
              <span className="text-[11px] font-mono" style={{ color: "var(--text-3)" }}>
                Berakhir: {formatDateWIB(trial.expirationDate)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
              <div className="p-2.5 rounded-lg border bg-black/30" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight" style={{ color: trialBadge.text }}>
                  {String(countdown.days).padStart(2, "0")}
                </span>
                <span className="block text-[10px] uppercase font-bold mt-0.5" style={{ color: "var(--text-3)" }}>
                  Hari
                </span>
              </div>
              <div className="p-2.5 rounded-lg border bg-black/30" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight" style={{ color: "var(--text-1)" }}>
                  {String(countdown.hours).padStart(2, "0")}
                </span>
                <span className="block text-[10px] uppercase font-bold mt-0.5" style={{ color: "var(--text-3)" }}>
                  Jam
                </span>
              </div>
              <div className="p-2.5 rounded-lg border bg-black/30" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight" style={{ color: "var(--text-1)" }}>
                  {String(countdown.minutes).padStart(2, "0")}
                </span>
                <span className="block text-[10px] uppercase font-bold mt-0.5" style={{ color: "var(--text-3)" }}>
                  Menit
                </span>
              </div>
              <div className="p-2.5 rounded-lg border bg-black/30" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight" style={{ color: "var(--accent)" }}>
                  {String(countdown.seconds).padStart(2, "0")}
                </span>
                <span className="block text-[10px] uppercase font-bold mt-0.5" style={{ color: "var(--text-3)" }}>
                  Detik
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Quick Calibration Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold mr-1" style={{ color: "var(--text-3)" }}>
            Sinkronkan Cepat:
          </span>
          <button
            onClick={() => handleQuickCalibrate(4, 0.37)}
            disabled={savingConfig}
            className="btn-ghost px-2.5 py-1 text-xs font-mono"
            title="Set tepat sisa 4 hari / saldo $0.37"
          >
            Sisa 4 Hari ($0.37)
          </button>
          <button
            onClick={() => handleQuickCalibrate(3)}
            disabled={savingConfig}
            className="btn-ghost px-2.5 py-1 text-xs font-mono"
          >
            Sisa 3 Hari
          </button>
          <button
            onClick={() => handleQuickCalibrate(2)}
            disabled={savingConfig}
            className="btn-ghost px-2.5 py-1 text-xs font-mono"
          >
            Sisa 2 Hari
          </button>
          <button
            onClick={() => handleQuickCalibrate(1)}
            disabled={savingConfig}
            className="btn-ghost px-2.5 py-1 text-xs font-mono"
          >
            Sisa 1 Hari
          </button>
        </div>

        {/* Visual Progress Bar */}
        {trial && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span style={{ color: "var(--text-2)" }}>
                Pemakaian: {trial.elapsedDays} hari ({trialUsedPercent}%)
              </span>
              <span style={{ color: trialBadge.text }}>
                Sisa: {trial.remainingDays} hari ({trialRemainingPercent}%)
              </span>
            </div>

            <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${trialUsedPercent}%`,
                  background:
                    trial.status === "critical"
                      ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                      : trial.status === "warning"
                      ? "linear-gradient(90deg, #10b981, #f59e0b)"
                      : "var(--accent-gradient)",
                }}
              />
            </div>
          </div>
        )}

        {/* 4 Kolom Stat Ringkas */}
        {trial && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-1">
            <div className="p-3.5 rounded-xl border" style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--border)" }}>
              <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-3)" }}>
                Sisa Waktu Aktif
              </span>
              <p className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: trialBadge.text }}>
                {trial.remainingDays} Hari
              </p>
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                ≈ {trial.remainingHours} Jam aktif
              </span>
            </div>

            <div className="p-3.5 rounded-xl border" style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--border)" }}>
              <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-3)" }}>
                Estimasi Saldo Credit
              </span>
              <p className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
                ${trial.estimatedCreditRemaining}
              </p>
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                dari batas ${trial.totalCreditLimit.toFixed(2)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl border" style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--border)" }}>
              <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-3)" }}>
                Estimasi Trial Habis
              </span>
              <p className="text-xs sm:text-sm font-bold mt-1" style={{ color: "var(--text-1)" }}>
                {formatDateWIB(trial.expirationDate)}
              </p>
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                Rekomendasi migrasi sebelum H-2
              </span>
            </div>

            <div className="p-3.5 rounded-xl border" style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--border)" }}>
              <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-3)" }}>
                Mulai Berjalan Sejak
              </span>
              <p className="text-xs sm:text-sm font-semibold mt-1" style={{ color: "var(--text-2)" }}>
                {formatDateWIB(trial.trialStartDate)}
              </p>
              <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                {trial.elapsedHours} jam pemakaian
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── KARTU UTAMA 2: AUTO BACKUP KE TELEGRAM (SAVED MESSAGES) ─── */}
      <div className="cyber-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg" style={{ background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" }}>
              <Send size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--text-1)" }}>
                Pencadangan Otomatis ke Telegram (Pesan Tersimpan)
              </h3>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Snapshot konfigurasi dan database dikirim langsung ke Saved Messages akun bot agar siap diunduh kapan saja.
              </p>
            </div>
          </div>

          <button
            onClick={handleSendBackupToTelegram}
            disabled={sendingTg || (storage?.connectedAccountsCount || 0) === 0}
            className="btn-accent flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold shadow-sm transition hover:scale-[1.02]"
          >
            {sendingTg ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span>{sendingTg ? "Mengirim ke Telegram..." : "Kirim Backup ke Telegram Sekarang"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl border bg-black/20" style={{ borderColor: "var(--border)" }}>
            <span className="text-[11px] block mb-1" style={{ color: "var(--text-3)" }}>
              Status Akun Terhubung
            </span>
            <span className="font-bold" style={{ color: "var(--accent)" }}>
              {storage?.connectedAccountsCount || 0} dari {storage?.accountsCount || 0} Akun Aktif
            </span>
          </div>

          <div className="p-3 rounded-xl border bg-black/20" style={{ borderColor: "var(--border)" }}>
            <span className="text-[11px] block mb-1" style={{ color: "var(--text-3)" }}>
              Auto-Backup Saat Trial Menipis
            </span>
            <span className="font-semibold text-emerald-400">
              Aktif Otomatis (Saat Sisa &le; 4 Hari)
            </span>
          </div>

          <div className="p-3 rounded-xl border bg-black/20" style={{ borderColor: "var(--border)" }}>
            <span className="text-[11px] block mb-1" style={{ color: "var(--text-3)" }}>
              Auto-Backup Terakhir
            </span>
            <span className="font-semibold" style={{ color: "var(--text-2)" }}>
              {trial?.lastAutoTelegramBackupDate ? `${trial.lastAutoTelegramBackupDate}` : "Belum terpicu"}
            </span>
          </div>
        </div>

        {tgResultMsg && (
          <div className="p-3 rounded-lg text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
            <CheckCircle2 size={14} />
            <span>{tgResultMsg}</span>
          </div>
        )}

        {tgErrorMsg && (
          <div className="p-3 rounded-lg text-xs bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{tgErrorMsg}</span>
          </div>
        )}

        {/* Panduan Cepat Migrasi */}
        <div className="p-4 rounded-xl border space-y-2" style={{ background: "rgba(var(--accent-rgb), 0.04)", borderColor: "rgba(var(--accent-rgb), 0.2)" }}>
          <div className="flex items-center gap-2">
            <Zap size={14} style={{ color: "var(--accent)" }} />
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-1)" }}>
              Langkah Cepat Pindah ke Railway Baru (2 Menit)
            </h4>
          </div>
          <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: "var(--text-2)" }}>
            <li>
              Klik tombol <strong>"Kirim Backup ke Telegram Sekarang"</strong> atau <strong>"Unduh Full Backup"</strong> di atas.
            </li>
            <li>
              Buka akun Railway baru Anda, buat project baru dan deploy repositori <strong>{BRANDING.productName}</strong> ini.
            </li>
            <li>
              Buka website Railway yang baru, buka <strong>Dashboard</strong> lalu klik tombol <strong>"Impor Seluruh Konfigurasi"</strong>.
            </li>
            <li>
              Pilih file JSON hasil backup tadi. Semua bot Telegram langsung login otomatis tanpa perlu OTP ulang.
            </li>
          </ol>
        </div>
      </div>

      {/* ─── KARTU GRID: SPESIFIKASI DEPLOYMENT & RESOURCE ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KARTU 3: METADATA & IDENTITAS RAILWAY */}
        <div className="cyber-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <Layers size={16} style={{ color: "var(--accent)" }} />
              <h3 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                Spesifikasi & Identitas Deployment
              </h3>
            </div>
            {railway?.publicDomain && (
              <a
                href={`https://${railway.publicDomain}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs flex items-center gap-1 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                <span>Buka Domain</span>
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Environment</span>
              <span className="font-semibold uppercase" style={{ color: "var(--text-1)" }}>
                {railway?.environmentName}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Project ID</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-2)" }}>
                {railway?.projectId}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Service ID</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-2)" }}>
                {railway?.serviceId}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Deployment ID</span>
              <span className="font-mono text-[11px] truncate max-w-[200px]" style={{ color: "var(--text-2)" }}>
                {railway?.deploymentId}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Region Server</span>
              <span className="font-semibold" style={{ color: "var(--text-1)" }}>
                {railway?.region}
              </span>
            </div>

            {railway?.git?.commitSha && (
              <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                <span style={{ color: "var(--text-3)" }}>Git Commit</span>
                <span className="font-mono text-[11px]" style={{ color: "var(--accent)" }}>
                  {railway.git.commitSha} ({railway.git.branch || "main"})
                </span>
              </div>
            )}

            <div className="flex justify-between py-1">
              <span style={{ color: "var(--text-3)" }}>Runtime Platform</span>
              <span className="font-medium" style={{ color: "var(--text-2)" }}>
                Node.js {system?.nodeVersion} ({system?.platform} {system?.arch})
              </span>
            </div>
          </div>
        </div>

        {/* KARTU 4: RESOURCE CONTAINER (RAM, CPU, UPTIME) */}
        <div className="cyber-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <Activity size={16} style={{ color: "var(--accent)" }} />
              <h3 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                Resource Health & Performa Kontainer
              </h3>
            </div>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-3)" }}>
              PID: {system?.pid}
            </span>
          </div>

          <div className="space-y-3.5">
            {/* Uptime */}
            <div className="p-3 rounded-lg border flex items-center justify-between" style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <Clock size={15} style={{ color: "var(--accent)" }} />
                <span className="text-xs" style={{ color: "var(--text-3)" }}>Uptime Kontainer</span>
              </div>
              <span className="text-xs font-bold font-mono" style={{ color: "var(--text-1)" }}>
                {system?.uptimeFormatted}
              </span>
            </div>

            {/* RAM Usage Breakdown */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--text-3)" }}>Penggunaan RAM (RSS Process)</span>
                <span className="font-bold" style={{ color: (system?.memory.rssMB || 0) > 600 ? "#f59e0b" : "#10b981" }}>
                  {system?.memory.rssMB} MB
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round(((system?.memory.rssMB || 0) / 1024) * 100))}%`,
                    background: (system?.memory.rssMB || 0) > 600 ? "#f59e0b" : "var(--accent)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px]" style={{ color: "var(--text-3)" }}>
                <span>Heap V8: {system?.memory.heapUsedMB} MB / {system?.memory.heapTotalMB} MB</span>
                <span>Host RAM: {system?.memory.systemUsedMB} MB / {system?.memory.systemTotalMB} MB</span>
              </div>
            </div>

            {/* CPU & Load Average */}
            <div className="p-3 rounded-lg border space-y-1.5 text-xs" style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Cpu size={14} style={{ color: "var(--accent)" }} />
                  <span style={{ color: "var(--text-3)" }}>CPU Cores</span>
                </div>
                <span className="font-semibold" style={{ color: "var(--text-1)" }}>
                  {system?.cpuCores} Core ({system?.cpuModel})
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-3)" }}>Load Average (1m, 5m, 15m)</span>
                <span className="font-mono" style={{ color: "var(--text-2)" }}>
                  {system?.loadAvg?.join(", ")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KARTU BARIS: NETWORK TELEGRAM DC 5 & VOLUME STORAGE ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KARTU 5: KONEKSI & PATCH TELEGRAM DC 5 */}
        <div className="cyber-card p-5 space-y-3.5">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <Radio size={16} style={{ color: "var(--accent)" }} />
              <h3 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                Konektivitas Telegram DC 5
              </h3>
            </div>
            <span
              className="px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1"
              style={{
                background: network?.telegramDC5?.ok ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: network?.telegramDC5?.ok ? "#10b981" : "#ef4444",
              }}
            >
              {network?.telegramDC5?.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {network?.telegramDC5?.ok ? "Terhubung Normal" : "Terputus"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Target IP & Port</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-1)" }}>
                {network?.telegramDC5?.targetIp}:{network?.telegramDC5?.port}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Latency Probe</span>
              <span className="font-mono font-bold" style={{ color: (network?.telegramDC5?.latencyMs || 0) < 150 ? "#10b981" : "#f59e0b" }}>
                {network?.telegramDC5?.latencyMs} ms
              </span>
            </div>

            <div className="p-2.5 rounded-lg text-[11px] leading-relaxed" style={{ background: "rgba(0,0,0,0.2)", color: "var(--text-2)" }}>
              <ShieldCheck size={13} className="inline mr-1 text-[#10b981]" />
              <strong>Status Patch IP:</strong> Menggunakan IP alternatif DC 5 (<code>91.108.56.147</code>) untuk mencegah packet drop pada provider cloud Railway.
            </div>
          </div>
        </div>

        {/* KARTU 6: VOLUME STORAGE & PERSISTENSI */}
        <div className="cyber-card p-5 space-y-3.5">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <HardDrive size={16} style={{ color: "var(--accent)" }} />
              <h3 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                Penyimpanan Database & Volume
              </h3>
            </div>
            <span
              className="px-2 py-0.5 rounded text-[11px] font-semibold"
              style={{
                background: storage?.isPersistentVolume ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                color: storage?.isPersistentVolume ? "#10b981" : "#f59e0b",
              }}
            >
              {storage?.isPersistentVolume ? "Railway Persistent Volume" : "Local / Ephemeral Storage"}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Direktori DATA_DIR</span>
              <span className="font-mono text-[11px]" style={{ color: "var(--text-1)" }}>
                {storage?.dataDir}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Ukuran File Database</span>
              <span className="font-mono font-semibold" style={{ color: "var(--text-1)" }}>
                {storage?.dbFilesSizeFormatted}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <span style={{ color: "var(--text-3)" }}>Jumlah Akun Tersimpan</span>
              <span className="font-bold" style={{ color: "var(--accent)" }}>
                {storage?.accountsCount} Akun
              </span>
            </div>

            <div className="p-2.5 rounded-lg text-[11px] leading-relaxed" style={{ background: "rgba(0,0,0,0.2)", color: "var(--text-2)" }}>
              {storage?.isPersistentVolume ? (
                <span>
                  Database aman di volume Railway. Restart kontainer tidak akan menghapus akun atau session login.
                </span>
              ) : (
                <span>
                  Tips: Pasang Railway Volume pada mount path <code>DATA_DIR=/data</code> agar session bot tetap persisten saat deploy ulang.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODAL KALIBRASI TRIAL ─── */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="cyber-card p-6 max-w-md w-full space-y-4" style={{ background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-base font-bold" style={{ color: "var(--text-1)" }}>
                Kalibrasi Estimasi Trial Railway
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-xs px-2 py-1 rounded hover:bg-white/10"
                style={{ color: "var(--text-3)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold block" style={{ color: "var(--text-2)" }}>
                  Tanggal Mulai Trial / Deploy:
                </label>
                <input
                  type="datetime-local"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="input-field w-full px-3 py-2 rounded-lg text-xs"
                />
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  Sesuaikan dengan tanggal pertama kali mengaktifkan trial di Railway.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold block" style={{ color: "var(--text-2)" }}>
                    Durasi Trial (Hari):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={durationInput}
                    onChange={(e) => setDurationInput(Number(e.target.value))}
                    className="input-field w-full px-3 py-2 rounded-lg text-xs"
                  />
                  <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                    Default: 21 hari (500 jam).
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold block" style={{ color: "var(--text-2)" }}>
                    Total Credit Limit ($):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="100"
                    value={creditInput}
                    onChange={(e) => setCreditInput(Number(e.target.value))}
                    className="input-field w-full px-3 py-2 rounded-lg text-xs"
                  />
                  <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                    Default Railway: $5.00 Free Credit.
                  </span>
                </div>
              </div>

              {saveSuccessMsg && (
                <div className="p-2.5 rounded text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  Pengaturan kalibrasi berhasil disimpan.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="btn-accent px-4 py-1.5 text-xs font-semibold"
                >
                  {savingConfig ? "Menyimpan..." : "Simpan Pengaturan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
