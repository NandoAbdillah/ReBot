// src/App.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Terminal,
  Settings,
  Zap,
  Palette,
  LogOut,
  BrainCircuit,
  Server,
} from "lucide-react";
import { io } from "socket.io-client";
import { AnimatePresence, motion } from "motion/react";

import AccountProfile from "./components/AccountProfile";
import LoginPage from "./components/LoginPage";
import { Field } from "./components/DashboardWidgets";
import PinkAestheticBg from "./components/PinkAestheticBg";
import { BRANDING, APP_STORAGE_KEYS } from "./config/branding.js";

// Import Halaman Baru
import DashboardPage from "./pages/DashboardPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import AIPage from "./pages/AIPage";
import InspectPage from "./pages/InspectPage";

// Import Types
import { Log, AccountStatus, StatsData, FloodAlert } from "./types";

type ThemeName = "obsidian" | "phantom" | "blood" | "frost" | "pink";

const THEMES: { id: ThemeName; label: string }[] = [
  { id: "pink", label: "Lily Blossom (Soft Pink Glass)" },
  { id: "obsidian", label: "Obsidian" },
  { id: "phantom", label: "Phantom Violet" },
  { id: "blood", label: "Blood Circuit" },
  { id: "frost", label: "Neon Frost" },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [isToggling, setIsToggling] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [statsData, setStatsData] = useState<StatsData | null>(null);

  const [floodAlerts, setFloodAlerts] = useState<FloodAlert[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<
    "all" | "success" | "error" | "bot" | "info" | "warning" | "ai"
  >("all");
  const [statsAccountFilter, setStatsAccountFilter] = useState<string>("all");

  const [accountId, setAccountId] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAccountId, setPendingAccountId] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [authError, setAuthError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(APP_STORAGE_KEYS.theme);
    const oldSaved = localStorage.getItem("teleoffer-theme");
    if (oldSaved && !saved) {
      localStorage.setItem(APP_STORAGE_KEYS.theme, oldSaved);
      localStorage.removeItem("teleoffer-theme");
      return (oldSaved as ThemeName);
    }
    return (saved as ThemeName) || "pink";
  });

  const logsEndRef = useRef<HTMLDivElement>(null);

  const accountMatch = location.pathname.match(/^\/account\/(.+)$/);
  const selectedAccountId = accountMatch
    ? decodeURIComponent(accountMatch[1])
    : null;

  const PAGE_MAP: Record<string, string> = {
    "/logs": "logs",
    "/ai": "ai",
    "/inspect": "inspect",
    "/settings": "settings",
    "/": "dash",
  };
  const activePage = selectedAccountId ? "account" : (PAGE_MAP[location.pathname] ?? "dash");

  // Periksa sesi autentikasi server saat mount
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        setIsAuthed(Boolean(data?.authenticated));
        setCheckingAuth(false);
      })
      .catch(() => {
        setIsAuthed(false);
        setCheckingAuth(false);
      });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(APP_STORAGE_KEYS.theme, theme);
    document.title = `${BRANDING.productName} Dashboard`;
  }, [theme]);

  const loadConfig = async () => {
    try {
      const data = await fetch("/api/config").then((r) => r.json());
      setIsConnected(Boolean(data.connected));
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch {}
  };

  const loadStats = async () => {
    try {
      const params = new URLSearchParams({ days: "7" });
      if (statsAccountFilter !== "all")
        params.set("account", statsAccountFilter);
      const data = await fetch(`/api/stats?${params}`).then((r) => r.json());
      setStatsData(data);
    } catch {}
  };

  useEffect(() => {
    if (!isAuthed) return;

    loadConfig();
    loadStats();

    fetch("/api/logs")
      .then((r) => {
        if (r.status === 401) setIsAuthed(false);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data?.logs)) setLogs(data.logs.slice(0, 100));
      })
      .catch(() => {});

    const socket = io();
    socket.on("bot-log", (log) => {
      setLogs((prev) => {
        const exists = prev.some(
          (e) => e.timestamp === log.timestamp && e.message === log.message,
        );
        if (exists) return prev;
        return [log, ...prev].slice(0, 100);
      });
    });

    socket.on("flood-wait", (data: FloodAlert) => {
      setFloodAlerts((prev) => [
        ...prev.filter((a) => a.accountId !== data.accountId),
        data,
      ]);
    });

    const refreshInterval = setInterval(() => {
      loadConfig();
      loadStats();
    }, 5000);

    return () => {
      socket.disconnect();
      clearInterval(refreshInterval);
    };
  }, [isAuthed, statsAccountFilter]);

  useEffect(() => {
    if (floodAlerts.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setFloodAlerts((prev) => prev.filter((a) => a.until > now));
    }, 1000);
    return () => clearInterval(interval);
  }, [floodAlerts]);

  const resetForm = () => {
    setAccountId("");
    setApiId("");
    setApiHash("");
    setPhone("");
    setCode("");
    setPassword("");
    setAuthError("");
    setStep(1);
  };

  const connect = async () => {
    setAuthError("");
    if (!accountId.trim() || !apiId || !apiHash || !phone) {
      setAuthError("Semua field wajib diisi");
      return;
    }
    setIsConnecting(true);
    try {
      const r = await fetch("/api/tg/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: accountId.trim(),
          apiId,
          apiHash,
          phone,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setAuthError(d?.error || "Gagal mengirim kode");
        return;
      }
      setPendingAccountId(accountId.trim());
      setStep(2);
    } finally {
      setIsConnecting(false);
    }
  };

  const verify = async () => {
    setAuthError("");
    setIsVerifying(true);
    try {
      const r = await fetch("/api/tg/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: pendingAccountId,
          phone,
          code,
          password,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setAuthError(d?.error || "Verifikasi gagal");
        return;
      }
      setIsConnected(true);
      await loadConfig();
      setShowAddForm(false);
      resetForm();
    } finally {
      setIsVerifying(false);
    }
  };

  const removeAccount = async (id: string) => {
    await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await loadConfig();
  };

  const isAllActive =
    accounts.length > 0 && accounts.every((acc) => acc.isActive);

  const handleToggleAll = async () => {
    setIsToggling(true);
    try {
      if (isAllActive) {
        await fetch("/api/accounts/stop-all", { method: "POST" });
      } else {
        await fetch("/api/accounts/start-all", { method: "POST" });
      }
      await loadConfig();
    } finally {
      setIsToggling(false);
    }
  };

  const handleExportAll = async () => {
    try {
      const r = await fetch("/api/export-all");
      if (!r.ok) {
        alert("Gagal mengekspor seluruh konfigurasi");
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${BRANDING.productName.toLowerCase()}-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Error mengekspor konfigurasi: ${err.message}`);
    }
  };

  const handleImportAll = async (file: File): Promise<{ success: boolean; message?: string }> => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const r = await fetch("/api/import-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const resData = await r.json();
      if (r.ok && resData.success) {
        await loadConfig();
        await loadStats();
        return { success: true, message: resData.message || "Berhasil mengimpor seluruh konfigurasi!" };
      } else {
        return { success: false, message: resData.error || "Gagal mengimpor konfigurasi" };
      }
    } catch (err: any) {
      return { success: false, message: `Error membaca file JSON: ${err.message}` };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setIsAuthed(false);
  };

  if (checkingAuth) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center select-none"
        style={{
          background:
            "linear-gradient(135deg, #fff1f4 0%, #fdf2f8 40%, #fff5f7 70%, #fce7f3 100%)",
        }}
      >
        <div className="w-16 h-16 rounded-3xl bg-white/80 backdrop-blur-md border border-pink-200/80 shadow-[0_8px_20px_rgba(244,114,182,0.18)] flex items-center justify-center p-2 mb-4 animate-bounce">
          <img
            src={BRANDING.logoPath}
            alt={BRANDING.productName}
            className="w-full h-full object-contain"
          />
        </div>
        <p className="text-xs font-semibold text-slate-600 tracking-wide">
          Memuat {BRANDING.productName}...
        </p>
      </div>
    );
  }

  if (!isAuthed) return <LoginPage onLogin={() => setIsAuthed(true)} />;

  const navItems = [
    { page: "dash", path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { page: "ai", path: "/ai", icon: BrainCircuit, label: "AI Service" },
    { page: "inspect", path: "/inspect", icon: Server, label: "Deployment Inspect" },
    { page: "logs", path: "/logs", icon: Terminal, label: "Logs" },
    { page: "settings", path: "/settings", icon: Settings, label: "Settings" },
  ] as const;

  return (
    <div className="min-h-screen flex relative" style={{ background: "var(--bg-base)" }}>
      {theme === "pink" && <PinkAestheticBg />}
      {/* Sidebar Desktop */}
      <aside
        className="hidden md:flex w-[52px] flex-col items-center py-4 gap-1 fixed left-0 top-0 h-full z-40"
        style={{
          background: "var(--bg-card)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center mb-4 shrink-0 shadow-sm p-1.5 transition-transform hover:scale-105"
          style={{
            background: "var(--accent-gradient)",
            boxShadow: "var(--glow)",
          }}
        >
          <img
            src={BRANDING.logoPath}
            alt={BRANDING.productName}
            className="w-full h-full object-contain drop-shadow-xs"
          />
        </div>
        {navItems.map(({ page, path, icon: Icon, label }) => {
          const isActive =
            activePage === page ||
            (page === "settings" && activePage === "account");
          return (
            <button
              key={page}
              onClick={() => navigate(path)}
              title={label}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all relative"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-3)",
                background: isActive
                  ? "rgba(var(--accent-rgb), 0.1)"
                  : "transparent",
              }}
            >
              <Icon size={16} />
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2 mb-2">
          <div className="relative">
            <button
              onClick={() => setShowThemePicker(!showThemePicker)}
              title="Color Theme"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              style={{ color: "var(--text-3)" }}
            >
              <Palette size={15} />
            </button>
            <AnimatePresence>
              {showThemePicker && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="absolute left-[48px] bottom-0 p-2 rounded-lg flex flex-col gap-2 z-50"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTheme(t.id);
                        setShowThemePicker(false);
                      }}
                      className={`theme-dot ${theme === t.id ? "selected" : ""}`}
                      data-t={t.id}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
            style={{ color: "var(--text-3)" }}
          >
            <LogOut size={15} />
          </button>
          <div className={`status-dot ${isConnected ? "online" : "offline"}`} />
        </div>
      </aside>

      {/* Konten Utama */}
      <main className="md:ml-[52px] flex-1 min-h-screen pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          {activePage === "account" && selectedAccountId && (
            <motion.div
              key="account"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <AccountProfile
                key={selectedAccountId}
                account={accounts.find(
                  (a) => a.accountId === selectedAccountId,
                )}
                onBack={() => navigate(-1)}
                onDelete={async (id) => {
                  await removeAccount(id);
                  navigate("/");
                }}
                onRename={(newId) => {
                  navigate(`/account/${encodeURIComponent(newId)}`);
                  loadConfig();
                }}
                onRefresh={loadConfig}
              />
            </motion.div>
          )}

          {activePage === "dash" && (
            <motion.div
              key="dash"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardPage
                accounts={accounts}
                connectedCount={accounts.filter((a) => a.connected).length}
                floodAlerts={floodAlerts}
                statsData={statsData}
                logs={logs}
                statsAccountFilter={statsAccountFilter}
                setStatsAccountFilter={setStatsAccountFilter}
                isAllActive={isAllActive}
                handleToggleAll={handleToggleAll}
                isToggling={isToggling}
                setShowAddForm={setShowAddForm}
                resetForm={resetForm}
                navigate={navigate}
                onExportAll={handleExportAll}
                onImportAll={handleImportAll}
              />
            </motion.div>
          )}

          {activePage === "ai" && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <AIPage />
            </motion.div>
          )}

          {activePage === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <LogsPage
                logs={logs}
                setLogs={setLogs}
                logSearch={logSearch}
                setLogSearch={setLogSearch}
                logFilter={logFilter}
                setLogFilter={setLogFilter}
                logsEndRef={logsEndRef}
                accounts={accounts}
              />
            </motion.div>
          )}

          {activePage === "inspect" && (
            <motion.div
              key="inspect"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <InspectPage
                onExportAll={handleExportAll}
                navigate={navigate}
              />
            </motion.div>
          )}

          {activePage === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              <SettingsPage
                accounts={accounts}
                theme={theme}
                setTheme={setTheme}
                themes={THEMES}
                notificationPermission={Notification.permission}
                requestNotificationPermission={() =>
                  Notification.requestPermission().then(() => loadConfig())
                }
                navigate={navigate}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigasi Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass bottom-nav">
        <div className="flex items-center justify-around px-2 py-1.5">
          {navItems.map(({ page, path, icon: Icon, label }) => {
            const isActive =
              activePage === page ||
              (page === "settings" && activePage === "account");
            return (
              <button
                key={page}
                onClick={() => navigate(path)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[60px] relative"
                style={{ color: isActive ? "var(--accent)" : "var(--text-3)" }}
              >
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-y-1/2 w-5 h-[2px] rounded"
                    style={{
                      background: "var(--accent)",
                      boxShadow: "0 0 8px rgba(var(--accent-rgb), 0.5)",
                    }}
                  />
                )}
                <Icon size={19} />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modal Tambah Akun */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowAddForm(false);
                resetForm();
              }
            }}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="cyber-card corner-sigil w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl"
            >
              <div
                className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div>
                  <h2
                    className="text-base font-bold"
                    style={{ color: "var(--text-1)" }}
                  >
                    {step === 1 ? "Tambah Akun Telegram" : "Verifikasi OTP"}
                  </h2>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-3)" }}
                  >
                    {step === 1
                      ? "Masukkan kredensial Telegram"
                      : `Kode OTP dikirim ke ${phone}`}
                  </p>
                </div>
              </div>
              <div className="px-5 sm:px-6 py-5 space-y-3">
                {step === 1 ? (
                  <>
                    <Field
                      label="Account ID"
                      value={accountId}
                      onChange={setAccountId}
                      placeholder="contoh: akun-1"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="API ID"
                        value={apiId}
                        onChange={setApiId}
                        placeholder="12345678"
                      />
                      <Field
                        label="API Hash"
                        value={apiHash}
                        onChange={setApiHash}
                        placeholder="a1b2c3d4..."
                      />
                    </div>
                    <Field
                      label="Nomor HP"
                      value={phone}
                      onChange={setPhone}
                      placeholder="+62812345678"
                    />
                    {authError && (
                      <p
                        className="text-xs font-medium rounded-lg px-3 py-2"
                        style={{
                          color: "#fb7185",
                          background: "rgba(244,63,94,0.08)",
                          border: "1px solid rgba(244,63,94,0.15)",
                        }}
                      >
                        {authError}
                      </p>
                    )}
                    <button
                      onClick={connect}
                      disabled={isConnecting}
                      className="btn-accent w-full h-11 text-sm disabled:opacity-60"
                    >
                      {isConnecting ? "Mengirim kode..." : "Kirim Kode OTP →"}
                    </button>
                  </>
                ) : (
                  <>
                    <Field
                      label="Kode OTP"
                      value={code}
                      onChange={setCode}
                      placeholder="12345"
                    />
                    <Field
                      label="Password 2FA"
                      value={password}
                      onChange={setPassword}
                      type="password"
                      placeholder="••••••••"
                    />
                    {authError && (
                      <p
                        className="text-xs font-medium rounded-lg px-3 py-2"
                        style={{
                          color: "#fb7185",
                          background: "rgba(244,63,94,0.08)",
                          border: "1px solid rgba(244,63,94,0.15)",
                        }}
                      >
                        {authError}
                      </p>
                    )}
                    <button
                      onClick={verify}
                      disabled={isVerifying}
                      className="btn-accent w-full h-11 text-sm disabled:opacity-60"
                    >
                      {isVerifying
                        ? "Memverifikasi..."
                        : "Verifikasi & Sambungkan →"}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
