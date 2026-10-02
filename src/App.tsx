// src/App.tsx
import { useState, useRef } from "react";
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
import { AnimatePresence, motion } from "motion/react";

import AccountProfile from "./components/AccountProfile";
import LoginPage from "./components/LoginPage";
import { Field } from "./components/DashboardWidgets";
import PinkAestheticBg from "./components/PinkAestheticBg";
import { BRANDING } from "./config/branding.js";

// Import Halaman
import DashboardPage from "./pages/DashboardPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import AIPage from "./pages/AIPage";
import InspectPage from "./pages/InspectPage";

// Import Custom Hooks
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./hooks/useAuth";
import { useSocketLogs } from "./hooks/useSocketLogs";
import { useAccounts } from "./hooks/useAccounts";
import { useStats } from "./hooks/useStats";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const { theme, setTheme, themes } = useTheme();
  const { isAuthed, setIsAuthed, checkingAuth, logout, onLoginSuccess } = useAuth();
  const { logs, setLogs, floodAlerts } = useSocketLogs(isAuthed, () => setIsAuthed(false));

  const {
    accounts,
    isToggling,
    isAllActive,
    loadConfig,
    removeAccount,
    handleToggleAll,
    handleExportAll,
    handleImportAll,
    showAddForm,
    setShowAddForm,
    accountId,
    setAccountId,
    apiId,
    setApiId,
    apiHash,
    setApiHash,
    phone,
    setPhone,
    code,
    setCode,
    password,
    setPassword,
    step,
    authError,
    isConnecting,
    isVerifying,
    resetForm,
    connect,
    verify,
  } = useAccounts(isAuthed);

  const {
    statsData,
    statsAccountFilter,
    setStatsAccountFilter,
  } = useStats(isAuthed);

  const [showThemePicker, setShowThemePicker] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<
    "all" | "success" | "error" | "bot" | "info" | "warning" | "ai"
  >("all");

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
  const activePage = selectedAccountId
    ? "account"
    : (PAGE_MAP[location.pathname] ?? "dash");

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base text-2 text-sm font-medium">
        Memverifikasi sesi...
      </div>
    );
  }

  if (!isAuthed) {
    return <LoginPage onLogin={onLoginSuccess} />;
  }

  const navItems = [
    { page: "dash", path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { page: "ai", path: "/ai", icon: BrainCircuit, label: "AI Gatekeeper" },
    { page: "logs", path: "/logs", icon: Terminal, label: "Log Bot" },
    { page: "inspect", path: "/inspect", icon: Server, label: "Inspect & Deploy" },
    { page: "settings", path: "/settings", icon: Settings, label: "Pengaturan" },
  ];

  return (
    <div className="min-h-screen bg-base text-1 flex flex-col md:flex-row relative">
      {/* Background Soft Girly Pink Ambient Glow */}
      {theme === "pink" && <PinkAestheticBg />}

      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-theme bg-surface/80 backdrop-blur-md sticky top-0 h-screen z-20">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-theme flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={BRANDING.logoPath}
              alt={BRANDING.productName}
              className="w-8 h-8 rounded-xl object-contain drop-shadow-[0_4px_12px_rgba(244,114,182,0.35)]"
            />
            <div>
              <span className="font-bold text-sm tracking-wide text-1 block">
                {BRANDING.productName}
              </span>
              <span className="text-[10px] text-3 block -mt-0.5">
                {BRANDING.tagline}
              </span>
            </div>
          </div>
        </div>

        {/* Navigasi Utama */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          <div className="px-3 pb-2 text-[10px] font-semibold text-3 uppercase tracking-wider">
            Menu Utama
          </div>
          {navItems.map(({ page, path, icon: Icon, label }) => {
            const isActive =
              activePage === page ||
              (page === "settings" && activePage === "account");
            return (
              <button
                key={page}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? "bg-accent/15 text-accent shadow-sm font-semibold"
                    : "text-2 hover:text-1 hover:bg-card-hover"
                }`}
              >
                <Icon
                  size={16}
                  className={isActive ? "text-accent" : "text-3"}
                />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Sidebar */}
        <div className="p-3 border-t border-theme space-y-2">
          {/* Theme Selector Popover */}
          <div className="relative">
            <button
              onClick={() => setShowThemePicker(!showThemePicker)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-2 hover:text-1 hover:bg-card-hover transition"
            >
              <div className="flex items-center gap-2.5">
                <Palette size={14} className="text-3" />
                <span>Tema: {themes.find((t) => t.id === theme)?.label.split(" ")[0]}</span>
              </div>
              <span className="text-[10px] text-3 font-mono">▾</span>
            </button>
            {showThemePicker && (
              <div className="absolute bottom-full left-0 w-full mb-1 p-1.5 cyber-card modal-glass rounded-xl shadow-xl z-30 space-y-1">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setShowThemePicker(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex items-center justify-between ${
                      theme === t.id
                        ? "bg-accent/15 text-accent font-semibold"
                        : "text-2 hover:text-1 hover:bg-card-hover"
                    }`}
                  >
                    <span>{t.label}</span>
                    {theme === t.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition"
          >
            <LogOut size={14} />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 pb-20 md:pb-6 relative z-10">
        <AnimatePresence mode="wait">
          {activePage === "account" && selectedAccountId && (
            <motion.div
              key="account"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
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
                themes={themes}
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
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-theme"
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
              className="cyber-card modal-glass w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
            >
              <div
                className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-theme"
              >
                <div>
                  <h2 className="text-base font-bold text-1">
                    {step === 1 ? "Tambah Akun Telegram" : "Verifikasi OTP"}
                  </h2>
                  <p className="text-xs mt-0.5 text-3">
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
                        className="text-xs font-medium rounded-lg px-3 py-2 text-[#fb7185] bg-rose-500/10 border border-rose-500/20"
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
                        className="text-xs font-medium rounded-lg px-3 py-2 text-[#fb7185] bg-rose-500/10 border border-rose-500/20"
                      >
                        {authError}
                      </p>
                    )}
                    <button
                      onClick={verify}
                      disabled={isVerifying}
                      className="btn-accent w-full h-11 text-sm disabled:opacity-60"
                    >
                      {isVerifying ? "Memverifikasi..." : "Verifikasi & Simpan ✓"}
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
