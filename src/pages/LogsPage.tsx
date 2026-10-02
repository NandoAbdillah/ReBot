// src/pages/LogsPage.tsx
import { useState, useEffect } from "react";
import {
  Search,
  Download,
  AlertOctagon,
  Clock,
  Terminal,
  Activity,
  ShieldAlert,
  BrainCircuit,
  Trash2,
  Pencil,
  CheckSquare,
  Square,
  Save,
  X,
  Settings,
  Loader2,
  HardDrive,
} from "lucide-react";
import { Log } from "../types";
import { BRANDING } from "../config/branding.js";

interface LogsPageProps {
  logs: Log[];
  setLogs: (logs: Log[]) => void;
  logSearch: string;
  setLogSearch: (text: string) => void;
  logFilter: "all" | "success" | "error" | "bot" | "info" | "warning" | "ai";
  setLogFilter: (filter: "all" | "success" | "error" | "bot" | "info" | "warning" | "ai") => void;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  accounts: any[];
}

export default function LogsPage({
  logs,
  setLogs,
  logSearch,
  setLogSearch,
  logFilter,
  setLogFilter,
  logsEndRef,
  accounts,
}: LogsPageProps) {
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("today");
  const [historicalLogs, setHistoricalLogs] = useState<Log[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [range, setRange] = useState<"30m" | "1h" | "1d">("1d");
  const [summary, setSummary] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const [selectedTimestamps, setSelectedTimestamps] = useState<Set<string>>(new Set());
  const [editingLog, setEditingLog] = useState<Log | null>(null);
  const [editType, setEditType] = useState<string>("info");
  const [editMessage, setEditMessage] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  /* ── Bulk Manage Archives States ── */
  const [showManageArchives, setShowManageArchives] = useState(false);
  const [selectedArchiveDates, setSelectedArchiveDates] = useState<Set<string>>(new Set());
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);
  const [archiveDateSearch, setArchiveDateSearch] = useState("");
  const [storageUsage, setStorageUsage] = useState<any>(null);
  const [isPruning, setIsPruning] = useState(false);

  const loadDates = async () => {
    try {
      const r = await fetch("/api/logs/dates");
      if (r.ok) {
        const data = await r.json();
        setAvailableDates(data.dates);
      }
    } catch { }
  };

  const loadStorageUsage = async () => {
    try {
      const r = await fetch("/api/logs/storage-usage");
      if (r.ok) {
        const data = await r.json();
        setStorageUsage(data.usage);
      }
    } catch {}
  };

  const handlePruneRetention = async () => {
    setIsPruning(true);
    try {
      const r = await fetch("/api/logs/prune-retention", { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        alert(data.message || "Pembersihan retensi berhasil.");
        loadDates();
        loadStorageUsage();
      } else {
        alert(data.error || "Gagal menjalankan pembersihan retensi");
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm("PERINGATAN NYATA:\nHapus SELURUH file arsip log fisik dari server Railway secara permanen?\n\nTindakan ini benar-benar menghapus file dari disk fisik volume Railway, bukan sekadar menyembunyikannya.")) return;
    try {
      const r = await fetch("/api/logs/clear-all", { method: "DELETE" });
      const data = await r.json();
      if (r.ok) {
        alert(data.message || "Seluruh arsip log berhasil dihapus dari disk server.");
        setLogs([]);
        setHistoricalLogs([]);
        setSelectedDate("today");
        setSelectedTimestamps(new Set());
        loadDates();
        loadStorageUsage();
      } else {
        alert(data.error || "Gagal menghapus seluruh arsip log");
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  useEffect(() => {
    loadDates();
    loadStorageUsage();
  }, [logs]);

  useEffect(() => {
    setSelectedTimestamps(new Set());
    if (selectedDate === "today") {
      setHistoricalLogs([]);
      return;
    }
    const fetchHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const r = await fetch(`/api/logs/view/${selectedDate}`);
        if (r.ok) {
          const data = await r.json();
          setHistoricalLogs(data.logs);
        }
      } catch { }
      setIsLoadingHistory(false);
    };
    fetchHistory();
  }, [selectedDate]);

  const fetchAnalysis = async (selectedRange = range) => {
    setIsAnalyzing(true);
    setAnalysisError("");
    try {
      const r = await fetch("/api/logs/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: selectedRange }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Gagal menganalisis log");
      setSummary(data.summary);
    } catch (e: any) {
      setAnalysisError(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const detectedGroups = (() => {
    const groupsMap = new Map<string, string>();
    const regex = /(?:grup|target)\s*"([^"]+)"\s*\(ID:\s*(-\d+)\)/i;
    const skipRegex = /Grup\s*"([^"]+)"\s*\(ID:\s*(-\d+)\)/i;
    
    const currentLogsSource = selectedDate === "today" ? logs : historicalLogs;
    currentLogsSource.forEach((l) => {
      let match = l.message.match(regex);
      if (!match) match = l.message.match(skipRegex);
      if (match) {
        const title = match[1];
        const id = match[2];
        groupsMap.set(id, `${title} (${id})`);
      }
    });
    return Array.from(groupsMap.entries()).map(([id, label]) => ({ id, label }));
  })();

  const currentLogsSource = selectedDate === "today" ? logs : historicalLogs;
  const filteredLogs = currentLogsSource.filter((l) => {
    if (logFilter !== "all" && l.type !== logFilter) return false;
    if (selectedAccount !== "all") {
      const accBracket = `[${selectedAccount}]`;
      const accLabel = `[Akun: ${selectedAccount}`;
      const hasAccount = l.message.includes(accBracket) || l.message.includes(accLabel);
      if (!hasAccount) return false;
    }
    if (selectedGroup !== "all") {
      const hasGroup = l.message.includes(selectedGroup);
      if (!hasGroup) return false;
    }
    if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        const timePart = d.toLocaleTimeString("id-ID", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        });
        const ms = d.getMilliseconds().toString().padStart(3, "0");
        const parts = timePart.split(" ");
        const timeOnly = parts[0];
        const tzName = parts[1] || "";
        return `${timeOnly}.${ms}${tzName ? " " + tzName : ""}`;
      }
      return ts;
    } catch {
      return ts;
    }
  };

  const handleDownload = () => {
    if (selectedDate === "today") {
      const text = filteredLogs.map((l) => `[${formatTime(l.timestamp)}] [${l.type.toUpperCase()}] ${l.message}`).join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${BRANDING.productName.toLowerCase()}-logs-today-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      window.open(`/api/logs/download/${selectedDate}`, "_blank");
    }
  };

  const toggleSelectLog = (ts: string) => {
    setSelectedTimestamps((prev) => {
      const next = new Set(prev);
      if (next.has(ts)) next.delete(ts);
      else next.add(ts);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTimestamps.size === filteredLogs.length && filteredLogs.length > 0) {
      setSelectedTimestamps(new Set());
    } else {
      setSelectedTimestamps(new Set(filteredLogs.map((l) => l.timestamp)));
    }
  };

  const handleClearTodayLogs = async () => {
    if (!window.confirm("Bersihkan seluruh log console hari ini? Penyimpanan server akan dikosongkan.")) return;
    try {
      const r = await fetch("/api/logs/clear", { method: "DELETE" });
      if (r.ok) {
        setLogs([]);
        setSelectedTimestamps(new Set());
      } else {
        alert("Gagal membersihkan log");
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const handleDeleteDateLog = async (date: string) => {
    if (!window.confirm(`Hapus seluruh arsip file log tanggal ${date} dari server?`)) return;
    try {
      const r = await fetch(`/api/logs/date/${date}`, { method: "DELETE" });
      if (r.ok) {
        setHistoricalLogs([]);
        loadDates();
        setSelectedDate("today");
        setSelectedTimestamps(new Set());
      } else {
        alert("Gagal menghapus file log tanggal ini");
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const handleDeleteMultipleDates = async (datesToDelete: string[]) => {
    if (datesToDelete.length === 0) return;
    if (!window.confirm(`Hapus ${datesToDelete.length} file arsip log terpilih secara permanen dari server?`)) return;
    
    setIsDeletingMultiple(true);
    try {
      let successCount = 0;
      for (const d of datesToDelete) {
        try {
          const r = await fetch(`/api/logs/date/${d}`, { method: "DELETE" });
          if (r.ok) successCount++;
        } catch (err) {
          console.error(`Gagal menghapus arsip tanggal ${d}:`, err);
        }
      }
      alert(`Berhasil menghapus ${successCount} file arsip log.`);
      setHistoricalLogs([]);
      loadDates();
      setSelectedDate("today");
      setSelectedArchiveDates(new Set());
      setShowManageArchives(false);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsDeletingMultiple(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedTimestamps.size === 0) return;
    if (!window.confirm(`Hapus ${selectedTimestamps.size} log terpilih?`)) return;
    try {
      const tsArray = Array.from(selectedTimestamps);
      const r = await fetch("/api/logs/delete-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          timestamps: tsArray,
        }),
      });
      if (r.ok) {
        const tsSet = new Set(tsArray);
        if (selectedDate === "today") {
          setLogs(logs.filter((l) => !tsSet.has(l.timestamp)));
        } else {
          setHistoricalLogs(historicalLogs.filter((l) => !tsSet.has(l.timestamp)));
        }
        setSelectedTimestamps(new Set());
      } else {
        alert("Gagal menghapus log terpilih");
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const openEditModal = (l: Log) => {
    setEditingLog(l);
    setEditType(l.type || "info");
    setEditMessage(l.message || "");
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    setIsSavingEdit(true);
    try {
      const r = await fetch("/api/logs/edit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          timestamp: editingLog.timestamp,
          newType: editType,
          newMessage: editMessage,
        }),
      });
      if (r.ok) {
        const updated = { ...editingLog, type: editType as any, message: editMessage };
        if (selectedDate === "today") {
          setLogs(logs.map((l) => (l.timestamp === editingLog.timestamp ? updated : l)));
        } else {
          setHistoricalLogs(historicalLogs.map((l) => (l.timestamp === editingLog.timestamp ? updated : l)));
        }
        setEditingLog(null);
      } else {
        alert("Gagal memperbarui pesan log");
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-7 h-full flex flex-col">
      <div className="space-y-4 flex-1 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-1)" }}>
              <Terminal className="text-accent" /> System Console & Log Manager
            </h1>
            <p className="text-xs text-3 mt-1 flex items-center gap-1.5">
              <Clock size={12} /> Kelola & Hapus Log untuk Efisiensi Penyimpanan Server
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedTimestamps.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="btn-accent bg-rose-600 hover:bg-rose-700 text-white text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-md"
              >
                <Trash2 size={13} />
                <span>Hapus Terpilih ({selectedTimestamps.size})</span>
              </button>
            )}

            {selectedDate === "today" ? (
              <button
                onClick={handleClearTodayLogs}
                className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
                title="Kosongkan log console dan berkas log hari ini dari penyimpanan server"
              >
                <Trash2 size={13} />
                <span>Kosongkan Log Hari Ini</span>
              </button>
            ) : (
              <button
                onClick={() => handleDeleteDateLog(selectedDate)}
                className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5 text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
                title={`Hapus file log tanggal ${selectedDate} dari server`}
              >
                <Trash2 size={13} />
                <span>Hapus Log {selectedDate}</span>
              </button>
            )}
          </div>
        </div>

        {/* Retention Policy & Physical Storage Widget */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <HardDrive size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-1)]">
                  Kebijakan Retensi 2 Hari Aktif (Railway Volume Saver)
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  Auto-Prune Riil
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-3)] mt-0.5">
                Log fisik &gt; 2 hari otomatis dihapus permanen dari disk server agar kapasitas volume Railway tidak penuh.
                {storageUsage && (
                  <span className="text-[var(--text-2)] ml-1 font-mono font-medium">
                    (Log di server: {((storageUsage.logsBytes || 0) / 1024 / 1024).toFixed(2)} MB, {storageUsage.logsCount || 0} file)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            <button
              onClick={handlePruneRetention}
              disabled={isPruning}
              className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5 text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20"
              title="Jalankan pembersihan permanen file log dan backup yang lebih tua dari 2 hari"
            >
              <Trash2 size={13} />
              <span>{isPruning ? "Membersihkan..." : "Prune (>2 Hari)"}</span>
            </button>
            <button
              onClick={handleClearAllLogs}
              className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5 text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
              title="Hapus permanen SELURUH file log historis dari disk Railway"
            >
              <Trash2 size={13} />
              <span>Hapus Riil Semua Log</span>
            </button>
          </div>
        </div>

        <div className="cyber-card accent-top p-4 sm:p-5 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2.5 border-b border-theme">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-1">AI Log Intelligence & Insights</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-3">Range:</span>
              {(["30m", "1h", "1d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRange(r);
                    setSummary(null);
                  }}
                  className={`px-2.5 py-1 rounded border transition ${range === r ? "bg-accent border-accent text-black font-semibold" : "border-theme text-2 hover:bg-card-hover"}`}
                >
                  {r === "30m" ? "30 Menit" : r === "1h" ? "1 Jam" : "Hari Ini"}
                </button>
              ))}
              <button
                onClick={() => fetchAnalysis(range)}
                disabled={isAnalyzing}
                className="btn-accent text-[11px] px-2.5 py-1 flex items-center gap-1 disabled:opacity-50"
              >
                {isAnalyzing ? "Menganalisis..." : "Analisis"}
              </button>
            </div>
          </div>

          {analysisError && (
            <div className="p-3 bg-red-950/25 border border-red-900/50 rounded-lg text-xs text-red-400 mb-3">
              {analysisError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card-hover p-4 rounded-xl border border-theme flex flex-col min-h-[110px]">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-3 uppercase tracking-wider">
                <Activity size={13} className="text-accent" /> Performa Bot & AI
              </div>
              {isAnalyzing ? (
                <div className="flex-1 flex items-center justify-center"><span className="text-xs text-3">Membaca log...</span></div>
              ) : (
                <p className="text-xs text-2 leading-relaxed flex-1">{summary?.performance || "Klik Analisis untuk melihat performa."}</p>
              )}
            </div>

            <div className="bg-card-hover p-4 rounded-xl border border-theme flex flex-col min-h-[110px]">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-3 uppercase tracking-wider">
                <ShieldAlert size={13} className="text-rose-400" /> Deteksi Limit & Ban
              </div>
              {isAnalyzing ? (
                <div className="flex-1 flex items-center justify-center"><span className="text-xs text-3">Memeriksa limit...</span></div>
              ) : summary?.bannedAccounts && summary.bannedAccounts.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {summary.bannedAccounts.map((acc: string) => (
                    <span key={acc} className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded">
                      {acc}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-3 italic flex-1 flex items-center">Aman. Tidak ada limit terdeteksi.</p>
              )}
            </div>

            <div className="bg-card-hover p-4 rounded-xl border border-theme flex flex-col min-h-[110px]">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-3 uppercase tracking-wider">
                <BrainCircuit size={13} className="text-blue-400" /> Insights & Rekomendasi
              </div>
              {isAnalyzing ? (
                <div className="flex-1 flex items-center justify-center"><span className="text-xs text-3">Memproses insights...</span></div>
              ) : (
                <p className="text-xs text-2 leading-relaxed flex-1">{summary?.insights || "Tidak ada data."}</p>
              )}
            </div>

            <div className="bg-card-hover p-4 rounded-xl border border-theme flex flex-col min-h-[110px]">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-3 uppercase tracking-wider">
                <Terminal size={13} className="text-emerald-400" /> Pemahaman Konteks AI
              </div>
              {isAnalyzing ? (
                <div className="flex-1 flex items-center justify-center"><span className="text-xs text-3">Mengevaluasi...</span></div>
              ) : (
                <p className="text-xs text-2 leading-relaxed flex-1">{summary?.aiUnderstanding || "Tidak ada data."}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-3 font-semibold">Arsip:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="stats-account-select text-xs h-8 px-2 py-0 border border-theme rounded bg-card-hover text-1 font-semibold cursor-pointer max-w-[150px]"
            >
              <option value="today">Hari Ini (Live)</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSelectedArchiveDates(new Set());
                setArchiveDateSearch("");
                setShowManageArchives(true);
              }}
              className="btn-ghost w-8 h-8 flex items-center justify-center border border-theme rounded-lg hover:bg-card-hover text-3 hover:text-accent transition shrink-0"
              title="Kelola & Hapus beberapa arsip log sekaligus"
            >
              <Settings size={13} className="text-accent" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-3 font-semibold">Akun:</span>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="stats-account-select text-xs h-8 px-2 py-0 border border-theme rounded bg-card-hover text-1 font-semibold cursor-pointer max-w-[150px]"
            >
              <option value="all">Semua Akun</option>
              {accounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.accountId}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-3 font-semibold">Grup:</span>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="stats-account-select text-xs h-8 px-2 py-0 border border-theme rounded bg-card-hover text-1 font-semibold cursor-pointer max-w-[150px]"
            >
              <option value="all">Semua Grup</option>
              {detectedGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-3" />
            <input
              type="text"
              className="log-search-input pl-9"
              placeholder="Cari kata kunci log..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {selectedDate === "today" ? (
              <button
                onClick={handleClearTodayLogs}
                className="px-3 py-1.5 text-xs flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/25 text-rose-400 font-semibold rounded-lg transition"
                title="Bersihkan seluruh log console hari ini"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Bersihkan Log</span>
              </button>
            ) : (
              <button
                onClick={() => handleDeleteDateLog(selectedDate)}
                className="px-3 py-1.5 text-xs flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/25 text-rose-400 font-semibold rounded-lg transition"
                title={`Hapus file arsip log tanggal ${selectedDate}`}
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Hapus Arsip</span>
              </button>
            )}

            <button onClick={handleDownload} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Download size={13} /> <span className="hidden sm:inline">Unduh Log</span>
            </button>
          </div>
        </div>

        <div className="cyber-card overflow-hidden relative scan-overlay flex-1 flex flex-col min-h-[450px]">
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-theme bg-card-hover/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs text-3 hover:text-1 flex items-center gap-1.5 font-medium transition cursor-pointer"
                title="Pilih Semua Log"
              >
                {selectedTimestamps.size === filteredLogs.length && filteredLogs.length > 0 ? (
                  <CheckSquare size={14} className="text-accent" />
                ) : (
                  <Square size={14} className="text-3" />
                )}
                <span>Pilih Semua</span>
              </button>

              {selectedTimestamps.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="px-2.5 py-1 text-[11px] flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/25 text-rose-400 font-semibold rounded transition"
                  title="Hapus baris log yang terpilih"
                >
                  <Trash2 size={11} />
                  <span>Hapus Terpilih ({selectedTimestamps.size})</span>
                </button>
              )}

              <span className="text-[10px] font-mono text-3">
                ({filteredLogs.length} baris log)
              </span>
            </div>

            <span className="text-[10px] font-mono text-3">
              {selectedDate === "today" ? `root@${BRANDING.productName.toLowerCase()}:~# tail -f /var/log/system.log` : `root@${BRANDING.productName.toLowerCase()}:~# cat /var/log/system-${selectedDate}.log`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4 font-mono text-[12px] space-y-1.5 scrollbar-thin" style={{ background: "var(--bg-base)" }}>
            {isLoadingHistory ? (
              <div className="flex flex-col items-center justify-center h-full opacity-50">
                <Clock size={32} className="mb-2 text-3 animate-spin" />
                <p className="text-center italic" style={{ color: "var(--text-3)" }}>Memuat arsip log...</p>
              </div>
            ) : filteredLogs.map((l, i) => {
              const isError = l.type === "error";
              const isWarning = l.type === "warning";
              const isAi = l.type === "ai";
              const isSelected = selectedTimestamps.has(l.timestamp);

              let rowClass = "hover:bg-card-hover";
              if (isSelected) rowClass = "bg-[rgba(16,185,129,0.12)] border-l-2 border-accent";
              else if (isError) rowClass = "bg-[rgba(244,63,94,0.08)] border-l-2 border-[#fb7185]";
              else if (isWarning) rowClass = "bg-[rgba(245,158,11,0.06)] border-l-2 border-[#fbbf24]";
              else if (isAi) rowClass = "bg-[rgba(59,130,246,0.06)] border-l-2 border-[#3b82f6]";

              let textColor = "var(--text-2)";
              if (l.type === "success") textColor = "#34d399";
              else if (isError) textColor = "#fb7185";
              else if (isWarning) textColor = "#f59e0b";
              else if (isAi) textColor = "#60a5fa";
              else if (l.type === "bot") textColor = "var(--accent-bright)";

              return (
                <div key={i} className={`group flex items-center gap-3 px-2.5 py-1.5 rounded-md transition ${rowClass}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectLog(l.timestamp)}
                    className="accent-accent cursor-pointer shrink-0 w-3.5 h-3.5"
                  />
                  <span className="shrink-0 select-none opacity-50 text-[11px]" style={{ color: "var(--text-3)" }}>
                    [{formatTime(l.timestamp)}]
                  </span>
                  <span className="shrink-0 uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-card border border-theme text-3">
                    {l.type || "info"}
                  </span>
                  <span
                    className="flex-1 break-words leading-relaxed"
                    style={{
                      color: textColor,
                      fontWeight: isError || isWarning || isAi || l.type === "bot" ? 600 : 400,
                    }}
                  >
                    {(() => {
                      const fullText = isError ? `[FATAL] ${l.message}` : l.message;
                      const urlRegex = /(https:\/\/t\.me\/[^\s|]+)/g;
                      const parts = fullText.split(urlRegex);

                      return parts.map((part, idx) => {
                        if (/^https:\/\/t\.me\/[^\s|]+$/.test(part)) {
                          return (
                            <a
                              key={idx}
                              href={part}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-400 hover:text-sky-300 underline font-semibold transition inline-flex items-center gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                              title="Buka pesan di Telegram"
                            >
                              {part}
                            </a>
                          );
                        }
                        return part;
                      });
                    })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditModal(l)}
                    className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-card rounded text-3 hover:text-accent shrink-0"
                    title="Edit pesan log ini"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              );
            })}

            {!isLoadingHistory && filteredLogs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-50">
                <Terminal size={32} className="mb-2 text-3" />
                <p className="text-center italic" style={{ color: "var(--text-3)" }}>Tidak ada log untuk filter/pencarian ini.</p>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>

      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="cyber-modal max-w-lg w-full bg-card border border-theme rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-theme bg-card-hover">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-accent" />
                <h3 className="text-sm font-bold text-1">Edit Entry Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="text-3 hover:text-1 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-3 uppercase tracking-wider block mb-1">
                  Kategori / Type Log
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full text-xs p-2 border border-theme rounded bg-card-hover text-1 font-semibold cursor-pointer"
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="bot">Bot</option>
                  <option value="ai">AI Intent</option>
                  <option value="warning">Warning / BWord</option>
                  <option value="error">Error</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-3 uppercase tracking-wider block mb-1">
                  Pesan Log
                </label>
                <textarea
                  rows={4}
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  className="w-full text-xs p-3 border border-theme rounded bg-card-hover text-1 font-mono focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-theme flex justify-end gap-2 bg-card-hover">
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="btn-ghost text-xs px-4 py-2"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="btn-accent text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <Save size={13} />
                <span>{isSavingEdit ? "Menyimpan..." : "Simpan Perubahan"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Archives Modal ── */}
      {showManageArchives && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="cyber-modal max-w-md w-full bg-card border border-theme rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 flex items-center justify-between border-b border-theme bg-card-hover">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-accent" />
                <h3 className="text-sm font-bold text-1">Kelola Arsip Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageArchives(false)}
                className="text-3 hover:text-1 transition p-1 hover:bg-card-hover rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 flex-1 flex flex-col min-h-0">
              <p className="text-xs text-3 leading-relaxed">
                Pilih satu atau beberapa file arsip log di bawah ini untuk dihapus secara permanen dari server guna membebaskan ruang penyimpanan.
              </p>

              {/* Search Dates */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-3" />
                <input
                  type="text"
                  placeholder="Cari tanggal (YYYY-MM-DD)..."
                  value={archiveDateSearch}
                  onChange={(e) => setArchiveDateSearch(e.target.value)}
                  className="input-cyber w-full pl-9 h-9 text-xs"
                />
              </div>

              {/* Selection list */}
              {(() => {
                const filteredDates = availableDates.filter((d) =>
                  d.toLowerCase().includes(archiveDateSearch.toLowerCase())
                );
                const isAllSelected =
                  filteredDates.length > 0 &&
                  filteredDates.every((d) => selectedArchiveDates.has(d));

                const toggleSelectAllDates = () => {
                  if (isAllSelected) {
                    setSelectedArchiveDates((prev) => {
                      const next = new Set(prev);
                      filteredDates.forEach((d) => next.delete(d));
                      return next;
                    });
                  } else {
                    setSelectedArchiveDates((prev) => {
                      const next = new Set(prev);
                      filteredDates.forEach((d) => next.add(d));
                      return next;
                    });
                  }
                };

                const toggleSelectDate = (date: string) => {
                  setSelectedArchiveDates((prev) => {
                    const next = new Set(prev);
                    if (next.has(date)) next.delete(date);
                    else next.add(date);
                    return next;
                  });
                };

                return (
                  <>
                    {/* Select all row */}
                    {filteredDates.length > 0 && (
                      <div className="flex items-center justify-between px-2 py-1.5 bg-card border border-theme rounded-lg shrink-0">
                        <label className="flex items-center gap-2 text-xs font-semibold text-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={toggleSelectAllDates}
                            className="accent-accent cursor-pointer w-3.5 h-3.5"
                          />
                          <span>Pilih Semua Hasil ({filteredDates.length})</span>
                        </label>
                        <span className="text-[10px] text-3 font-mono">
                          {selectedArchiveDates.size} terpilih
                        </span>
                      </div>
                    )}

                    {/* Dates list */}
                    <div className="flex-1 overflow-y-auto border border-theme rounded-xl bg-[rgba(var(--accent-rgb),0.01)] p-2 space-y-1 max-h-[300px] min-h-[150px] scrollbar-thin">
                      {filteredDates.map((d) => {
                        const isChecked = selectedArchiveDates.has(d);
                        return (
                          <label
                            key={d}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition text-xs border ${
                              isChecked
                                ? "bg-[rgba(var(--accent-rgb),0.05)] border-accent/30 text-1"
                                : "border-transparent hover:bg-card-hover text-2"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectDate(d)}
                              className="accent-accent cursor-pointer w-3.5 h-3.5 shrink-0"
                            />
                            <span className="font-mono">{d}</span>
                          </label>
                        );
                      })}
                      {filteredDates.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-40">
                          <Clock size={20} className="mb-1 text-3" />
                          <p className="text-xs italic text-center">Tidak ada file arsip log.</p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="px-5 py-3.5 border-t border-theme flex justify-between gap-3 bg-card-hover shrink-0">
              <button
                type="button"
                onClick={() => setShowManageArchives(false)}
                disabled={isDeletingMultiple}
                className="btn-ghost text-xs px-4 py-2"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteMultipleDates(Array.from(selectedArchiveDates))}
                disabled={selectedArchiveDates.size === 0 || isDeletingMultiple}
                className="btn-accent text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-40"
              >
                {isDeletingMultiple ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Hapus Terpilih ({selectedArchiveDates.size})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}