// src/pages/AIPage.tsx
import { useState, useEffect } from "react";
import {
  BrainCircuit,
  Key,
  Play,
  ShieldAlert,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Activity,
  Database,
  List,
  Pencil,
  Check,
  Power,
  X,
  GripVertical,
} from "lucide-react";
import { StatCard } from "../components/DashboardWidgets";
import AIStatsChart, { AIChartKeyData } from "../components/AIStatsChart";

interface KeyDetail {
  models: { [modelName: string]: number };
}

interface DailyStat {
  totalRequests: number;
  totalLimitHits: number;
  byKey: { [keyName: string]: number };
}

interface AIConfig {
  isActive: boolean;
  apiKeys: string[];
  stats: {
    requestsToday: number;
    limitHits: number;
  };
  dailyStats?: { [date: string]: DailyStat };
  keyDetails?: { [keyName: string]: KeyDetail };
  smartKeyEnabled?: boolean;
  smartKeyLimit?: number;
}

export default function AIPage() {
  const [config, setConfig] = useState<AIConfig>({
    isActive: false,
    apiKeys: [],
    stats: { requestsToday: 0, limitHits: 0 },
  });

  // Input Tambah Key
  const [keyNameInput, setKeyNameInput] = useState("");
  const [keyValueInput, setKeyValueInput] = useState("");

  // State Edit Key
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editNameInput, setEditNameInput] = useState("");
  const [editValueInput, setEditValueInput] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  // Drag & Drop States
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Playground State
  const [testMode, setTestMode] = useState<
    "intent" | "blocked" | "keyword" | "debug"
  >("intent");
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  // Real Logs & Chart Data
  const [realLogs, setRealLogs] = useState<any[]>([]);
  const [chartData, setChartData] = useState<AIChartKeyData[]>([]);

  const fetchData = async () => {
    try {
      // 1. Fetch Config
      const rConf = await fetch("/api/ai/config");
      if (rConf.ok) {
        const confData = await rConf.json();
        setConfig(confData);

        // Membangun data chart riil time (H-6 sampai Hari Ini)
        const history: AIChartKeyData[] = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr =
            i === 0
              ? "Hari Ini"
              : d.toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                });
          const dateKey = d.toISOString().slice(0, 10);

          const dayStat = confData.dailyStats?.[dateKey] || {
            totalRequests: 0,
            totalLimitHits: 0,
            byKey: {},
          };

          // Build the keys dictionary for this day
          const keys: { [keyName: string]: number } = {};
          
          // Pre-populate keys currently in the config
          confData.apiKeys.forEach((rawKey: string) => {
            const parts = rawKey.split("|");
            const name = parts.length > 1 ? parts[0] : "Akun API";
            keys[name] = dayStat.byKey?.[name] || 0;
          });

          // Also pull from dayStat.byKey if keys were deleted/renamed
          if (dayStat.byKey) {
            Object.keys(dayStat.byKey).forEach((name) => {
              if (keys[name] === undefined) {
                keys[name] = dayStat.byKey[name];
              }
            });
          }

          history.push({
            date: dateStr,
            dateKey: dateKey,
            keys: keys,
            total: dayStat.totalRequests || 0,
          });
        }
        setChartData(history);
      }

      // 2. Fetch Logs
      const rLogs = await fetch("/api/logs");
      if (rLogs.ok) {
        const logData = await rLogs.json();
        const aiLogs = logData.logs
          .filter(
            (log: any) =>
              log.message.includes("AI") ||
              log.message.includes("Intent") ||
              log.message.includes("Terkena Limit"),
          )
          .slice(0, 20);
        setRealLogs(aiLogs);
      }
    } catch {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const saveSettings = async (updates: Partial<AIConfig>) => {
    setIsSaving(true);
    const newConfig = { ...config, ...updates };
    setConfig(newConfig); // Optimistic UI
    try {
      await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
    } catch {
      fetchData();
    } finally {
      setIsSaving(false);
    }
  };

  // --- Parser Format API Key: "NamaAkun|API_KEY|isActive" ---
  const parseKey = (raw: string) => {
    const parts = raw.split("|");
    return {
      name: parts.length > 1 ? parts[0] : "Akun API",
      key: parts.length > 1 ? parts[1] : parts[0],
      isActive: parts.length > 2 ? parts[2] === "true" : true,
    };
  };
  const stringifyKey = (name: string, key: string, isActive: boolean) =>
    `${name}|${key}|${isActive}`;

  const addKey = () => {
    const name = keyNameInput.trim() || "Akun AI Baru";
    const key = keyValueInput.trim();
    if (!key) return;

    const combined = stringifyKey(name, key, true);
    if (config.apiKeys.includes(combined)) return;

    saveSettings({ apiKeys: [...config.apiKeys, combined] });
    setKeyNameInput("");
    setKeyValueInput("");
  };

  const removeKey = (index: number) => {
    saveSettings({ apiKeys: config.apiKeys.filter((_, i) => i !== index) });
  };

  const toggleKey = (index: number) => {
    const parsed = parseKey(config.apiKeys[index]);
    const updated = [...config.apiKeys];
    updated[index] = stringifyKey(parsed.name, parsed.key, !parsed.isActive);
    saveSettings({ apiKeys: updated });
  };

  const startEditing = (index: number) => {
    const parsed = parseKey(config.apiKeys[index]);
    setEditNameInput(parsed.name);
    setEditValueInput(parsed.key);
    setEditingIndex(index);
  };

  const saveEdit = (index: number) => {
    const parsed = parseKey(config.apiKeys[index]);
    const updated = [...config.apiKeys];
    updated[index] = stringifyKey(
      editNameInput.trim() || "Akun API",
      editValueInput.trim(),
      parsed.isActive,
    );
    saveSettings({ apiKeys: updated });
    setEditingIndex(null);
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newKeys = [...config.apiKeys];
    const draggedItem = newKeys[draggedIndex];
    
    newKeys.splice(draggedIndex, 1);
    newKeys.splice(index, 0, draggedItem);

    saveSettings({ apiKeys: newKeys });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const runTest = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!testInput.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    setTestError("");

    try {
      const r = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: testMode, input: testInput.trim() }),
      });
      const data = await r.json();

      if (!r.ok) throw new Error(data.error || "Gagal menghubungi AI");
      setTestResult(data.result);
      fetchData();
    } catch (e: any) {
      setTestError(e.message);
      fetchData();
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-7 h-full flex flex-col">
      <div className="space-y-6 flex-1 flex flex-col">
        {/* ── HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <h1
              className="text-xl sm:text-2xl font-bold flex items-center gap-2"
              style={{ color: "var(--text-1)" }}
            >
              <BrainCircuit className="text-accent" /> AI Service & Copilot
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
              Manajemen LLM Gemini, Multi API Key, Statistik Penggunaan &
              Klasifikasi Niat (Intent).
            </p>
          </div>

          <div className="cyber-card px-5 py-3 flex items-center gap-3">
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-2)" }}
            >
              Status Master AI:
            </span>
            <div
              className={`toggle-track shrink-0 ${config.isActive ? "active" : ""}`}
              style={{
                opacity: isSaving ? 0.6 : 1,
                cursor: "pointer",
                transform: "scale(1.1)",
              }}
              onClick={() => saveSettings({ isActive: !config.isActive })}
            >
              <div className="toggle-thumb" />
            </div>
            <span
              className="text-sm font-bold"
              style={{ color: config.isActive ? "#34d399" : "var(--text-3)" }}
            >
              {config.isActive ? "AKTIF" : "NONAKTIF"}
            </span>
          </div>
        </div>

        {/* ── STATISTIC CARDS (OMBO) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          <StatCard
            icon={<Activity size={18} />}
            label="Total Request (Hari Ini)"
            value={config.stats.requestsToday}
          />
          <StatCard
            icon={<BrainCircuit size={18} />}
            label="Pesan Intent Diproses"
            value={config.stats.requestsToday}
            className="border-[#10b981] bg-[rgba(16,185,129,0.03)]"
          />
          <StatCard
            icon={<Database size={18} />}
            label="Estimasi Token Dipakai"
            value={config.stats.requestsToday * 40}
            className="border-[#6366f1] bg-[rgba(99,102,241,0.03)]"
          />
          <StatCard
            icon={<AlertTriangle size={18} />}
            label="API Limit / 429 Hits"
            value={config.stats.limitHits}
            className={
              config.stats.limitHits > 0
                ? "border-[#fb7185] bg-[rgba(244,63,94,0.03)]"
                : ""
            }
          />
        </div>

        {/* ── BIG CHART (Lurus & Hoverable) ── */}
        <div className="shrink-0">
          <AIStatsChart data={chartData} />
        </div>

        {/* ── BOTTOM GRID (API KEYS & LOGS/TESTING) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[500px]">
          {/* KOLOM KIRI: API KEY MANAGER (Tinggi Fleksibel, Gak Pelit Space) */}
          <div className="cyber-card accent-top p-5 sm:p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-5 border-b border-theme pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-accent" />
                <h3 className="text-base font-bold text-1">
                  Manajemen API Keys
                </h3>
              </div>
              <span className="text-sm font-bold text-[#34d399]">
                {config.apiKeys.filter((k) => parseKey(k).isActive).length} Key
                Aktif
              </span>
            </div>

            {/* Form Tambah Key (Nyaman dipandang) */}
            <div className="flex flex-col gap-3 mb-6 bg-card-hover p-4 rounded-xl border border-theme shrink-0">
              <span className="text-xs font-bold text-3 uppercase tracking-wider">
                Tambah Key Baru
              </span>
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <input
                  type="text"
                  value={keyNameInput}
                  onChange={(e) => setKeyNameInput(e.target.value)}
                  disabled={isSaving}
                  placeholder="Nickname (misal: Akun Shelly)"
                  className="input-cyber h-10 px-4 text-sm sm:w-1/3"
                />
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="password"
                    value={keyValueInput}
                    onChange={(e) => setKeyValueInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addKey();
                    }}
                    disabled={isSaving}
                    placeholder="Ketik API Key Gemini (AIzaSy...)"
                    className="input-cyber h-10 px-4 text-sm flex-1 min-w-0"
                  />
                  <button
                    onClick={addKey}
                    disabled={isSaving || !keyValueInput.trim()}
                    className="btn-accent h-10 px-5 flex items-center justify-center shrink-0 disabled:opacity-40 font-bold text-sm"
                  >
                    {isSaving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={16} className="mr-1" /> Tambah
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Smart Key Switcher Config */}
            <div className="flex flex-col gap-3 mb-6 bg-card-hover p-4 rounded-xl border border-theme shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-1 uppercase tracking-wider">
                    Smart Rotation & Backup Key
                  </span>
                  <span className="text-[10px] text-3 mt-0.5">
                    Bagi beban request merata & aktifkan key cadangan jika limit.
                  </span>
                </div>
                <div
                  className={`toggle-track shrink-0 ${config.smartKeyEnabled ? "active" : ""}`}
                  style={{
                    opacity: isSaving ? 0.6 : 1,
                    cursor: "pointer",
                  }}
                  onClick={() => saveSettings({ smartKeyEnabled: !config.smartKeyEnabled })}
                >
                  <div className="toggle-thumb" />
                </div>
              </div>
              {config.smartKeyEnabled && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-1 border-t border-theme pt-3 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-2 font-medium">Limit Harian Per Key:</span>
                    <input
                      type="number"
                      value={config.smartKeyLimit ?? 50}
                      onChange={(e) => saveSettings({ smartKeyLimit: Math.max(1, parseInt(e.target.value) || 0) })}
                      min="1"
                      className="input-cyber h-8 w-20 text-center px-1 text-xs font-bold"
                    />
                  </div>
                  <span className="text-[10px] text-3 italic">
                    *Jika request harian suatu key melewati limit, key cadangan (off) akan dipaksa aktif.
                  </span>
                </div>
              )}
            </div>

            {/* List API Keys (Scrollable, Full Height) */}
            <div className="space-y-3 flex-1 overflow-y-auto pr-2 scrollbar-thin">
              {config.apiKeys.map((rawKey, i) => {
                const { name, key, isActive } = parseKey(rawKey);
                const isEditing = editingIndex === i;

                // Cek apakah key ini ada di log error [AI Token]
                const isLimitHit = realLogs.some(
                  (log) =>
                    log.message.includes("[AI Token]") &&
                    log.message.includes(name),
                );

                const isDragged = draggedIndex === i;
                const isDragOver = dragOverIndex === i && draggedIndex !== i;

                return (
                  <div
                    key={i}
                    draggable={!isEditing && !isSaving}
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                    className={`p-4 border rounded-xl transition-all duration-200 ${
                      isDragged 
                        ? "opacity-35 border-dashed border-accent" 
                        : isDragOver 
                          ? "border-accent bg-accent/5 scale-[1.02] shadow-lg shadow-accent/5" 
                          : isLimitHit 
                            ? "bg-[rgba(244,63,94,0.05)] border-[#fb7185]" 
                            : isActive 
                              ? "bg-card-hover border-theme" 
                              : "bg-base border-theme opacity-60 grayscale"
                    }`}
                  >
                    {isEditing ? (
                      // ... (Kodingan mode edit tetap sama seperti sebelumnya) ...
                      <div className="flex flex-col gap-3">
                        <input
                          value={editNameInput}
                          onChange={(e) => setEditNameInput(e.target.value)}
                          placeholder="Nickname"
                          className="input-cyber h-10 px-3 text-sm"
                        />
                        <input
                          value={editValueInput}
                          onChange={(e) => setEditValueInput(e.target.value)}
                          placeholder="API Key"
                          className="input-cyber h-10 px-3 text-sm font-mono"
                        />
                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="btn-ghost px-5 py-2 text-xs font-semibold"
                          >
                            Batal
                          </button>
                          <button
                            onClick={() => saveEdit(i)}
                            className="btn-accent px-5 py-2 text-xs font-bold flex items-center gap-1.5"
                          >
                            <Check size={14} /> Simpan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Drag Handle */}
                            <div 
                              className="shrink-0 text-3 cursor-grab active:cursor-grabbing hover:text-accent p-1"
                              title="Geser untuk ubah prioritas"
                            >
                              <GripVertical size={16} />
                            </div>

                            <div className="shrink-0 flex items-center justify-center">
                              <button
                                onClick={() => toggleKey(i)}
                                disabled={isSaving}
                                title={isActive ? "Matikan Key" : "Nyalakan Key"}
                                className="hover:scale-110 transition p-1"
                              >
                                {isLimitHit ? (
                                  <AlertTriangle
                                    size={20}
                                    className="text-[#fb7185]"
                                  />
                                ) : (
                                  <Power
                                    size={20}
                                    className={
                                      isActive ? "text-[#34d399]" : "text-3"
                                    }
                                  />
                                )}
                              </button>
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span
                                className={`text-base font-bold truncate ${isLimitHit ? "text-[#fb7185]" : isActive ? "text-1" : "text-3 line-through"}`}
                              >
                                {name}
                              </span>
                              <span className="text-xs font-mono text-3 truncate mt-0.5">
                                {key.substring(0, 8)}••••••••
                                {key.substring(key.length - 4)}
                              </span>
                              {isLimitHit && (
                                <span className="text-[10px] text-[#fb7185] font-semibold mt-1">
                                  Quota Exceeded (429)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => startEditing(i)}
                              disabled={isSaving}
                              className="p-2 text-3 hover:text-accent bg-base border border-transparent hover:border-theme rounded-lg transition"
                              title="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => removeKey(i)}
                              disabled={isSaving}
                              className="p-2 text-3 hover:text-[#f43f5e] bg-base border border-transparent hover:border-theme rounded-lg transition"
                              title="Hapus"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Breakdown Model & Request per Model */}
                        {config.keyDetails?.[name]?.models && Object.keys(config.keyDetails[name].models).length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-theme flex flex-wrap gap-2">
                            {Object.entries(config.keyDetails[name].models).map(([modelName, reqCount]) => (
                              <span
                                key={modelName}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono"
                                style={{
                                  background: "var(--bg-base)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text-2)",
                                }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                                <span className="opacity-80">{modelName}:</span>
                                <strong style={{ color: "var(--text-1)" }}>{reqCount}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {config.apiKeys.length === 0 && (
                <div className="text-center py-10 bg-base border border-dashed border-theme rounded-xl h-full flex flex-col items-center justify-center">
                  <Key size={30} className="text-theme mb-3" />
                  <p className="text-sm italic text-3">
                    Belum ada API Key yang didaftarkan.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* KOLOM KANAN: LOGS & TESTING (Flex-1 kabeh ben proporsional) */}
          <div className="flex flex-col gap-6 h-full">
            {/* Live AI Logs */}
            <div
              className="cyber-card accent-top p-5 sm:p-6 flex flex-col shrink-0"
              style={{ maxHeight: "350px" }}
            >
              <div className="flex items-center justify-between mb-4 border-b border-theme pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <List size={18} className="text-accent" />
                  <h3 className="text-base font-bold text-1">
                    Live AI Decisions Logs
                  </h3>
                </div>
                <span className="text-xs text-3 flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-[#34d399] rounded-full" />{" "}
                  Real-time Server
                </span>
              </div>
              <div className="space-y-3 flex-1 overflow-y-auto scrollbar-thin pr-2">
                {realLogs.map((log, i) => {
                  const isSkip =
                    log.message.includes("SKIP") ||
                    log.message.includes("diabaikan");
                  const isTokenError = log.message.includes("[AI Token]");

                  // Parsing text dan reason jika formatnya menggunakan | Alasan:
                  const msgParts = log.message.split("| Alasan:");
                  const mainMessage = msgParts[0]
                    .replace("[AI Intent]", "")
                    .replace("[AI Token]", "")
                    .trim();
                  const reason =
                    msgParts.length > 1 ? msgParts[1].trim() : null;

                  return (
                    <div
                      key={i}
                      className={`flex gap-3 p-3 bg-card-hover border rounded-xl text-sm ${isTokenError ? "border-[#fb7185] bg-[rgba(244,63,94,0.02)]" : "border-theme"}`}
                    >
                      <span className="text-3 shrink-0 font-mono mt-0.5 text-xs">
                        {log.timestamp}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${isTokenError ? "bg-[rgba(244,63,94,0.1)] text-[#fb7185]" : isSkip ? "bg-[rgba(244,63,94,0.1)] text-[#fb7185]" : "bg-[rgba(16,185,129,0.1)] text-[#34d399]"}`}
                          >
                            {isTokenError
                              ? "ERROR API"
                              : isSkip
                                ? "SKIP"
                                : "PROMOSI"}
                          </span>
                          <span className="text-1 font-semibold text-xs truncate">
                            Sistem AI
                          </span>
                        </div>
                        <p
                          className={`text-xs leading-relaxed break-words ${isTokenError ? "text-[#fb7185] font-medium" : "text-2"}`}
                        >
                          {mainMessage}
                        </p>

                        {/* Render Reason secara khusus di bawah message */}
                        {reason && (
                          <div className="mt-2 p-2 rounded-lg bg-base border border-dashed border-theme flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider font-bold text-accent">
                              Reasoning AI:
                            </span>
                            <p className="text-[11px] text-3 italic leading-relaxed">
                              "{reason}"
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {realLogs.length === 0 && (
                  <p className="text-xs text-center italic text-3 py-6">
                    Belum ada aktivitas AI terekam.
                  </p>
                )}
              </div>
            </div>

            {/* Testing Ground */}
            <div className="cyber-card accent-top p-5 sm:p-6 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-4 border-b border-theme pb-3 shrink-0">
                <ShieldAlert size={18} className="text-accent" />
                <h3 className="text-base font-bold text-1">
                  Uji Coba Prompt (Playground)
                </h3>
              </div>

              <div className="flex flex-wrap gap-2 mb-4 shrink-0">
                <button
                  onClick={() => setTestMode("intent")}
                  className={`log-filter-chip text-xs px-4 py-2 ${testMode === "intent" ? "active" : ""}`}
                >
                  Cek Intent Menfess
                </button>
                <button
                  onClick={() => setTestMode("blocked")}
                  className={`log-filter-chip text-xs px-4 py-2 ${testMode === "blocked" ? "active" : ""}`}
                >
                  Generate Blocked Words
                </button>
                <button
                  onClick={() => setTestMode("keyword")}
                  className={`log-filter-chip text-xs px-4 py-2 ${testMode === "keyword" ? "active" : ""}`}
                >
                  Generate Typo Keyword
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-4">
                <textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder={
                    testMode === "intent"
                      ? "Ketik kalimat panjang (misal: Eh ada yang tau cara beli netflix yang aman?)..."
                      : testMode === "blocked"
                        ? "Ketik satu kata terlarang..."
                        : "Ketik keyword produk..."
                  }
                  className="input-cyber w-full h-24 p-4 text-sm resize-none shrink-0"
                />

                <button
                  type="button"
                  onClick={(e) => runTest(e)}
                  disabled={
                    isTesting ||
                    !testInput.trim() ||
                    config.apiKeys.length === 0 ||
                    !config.isActive
                  }
                  className="btn-accent py-3 flex items-center justify-center gap-2 font-bold text-sm disabled:opacity-40 shrink-0"
                >
                  {isTesting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Play size={18} />
                  )}
                  {!config.isActive
                    ? "Nyalakan Status AI Dulu"
                    : config.apiKeys.length === 0
                      ? "Masukkan API Key Dulu"
                      : "Jalankan AI Sekarang"}
                </button>

                <div className="mt-1 p-5 bg-base border border-theme rounded-xl flex-1 flex flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-3 mb-3 block shrink-0">
                    Output Terminal
                  </span>
                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    {isTesting ? (
                      <div className="flex items-center gap-2 text-accent text-sm font-semibold">
                        <BrainCircuit size={16} className="animate-spin" /> Sedang mengevaluasi konteks
                        dengan Gemini...
                      </div>
                    ) : testError ? (
                      <div className="text-sm text-[#fb7185] font-semibold break-words">
                        [ERROR] {testError}
                      </div>
                    ) : testResult ? (
                      <pre className="text-sm font-mono text-[#34d399] whitespace-pre-wrap break-words">
                        {JSON.stringify(testResult, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-sm italic text-3">
                        Menunggu eksekusi...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
