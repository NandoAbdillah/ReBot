// src/pages/SettingsPage.tsx
import { Palette, Bell, BellOff } from "lucide-react";
import { AccountStatus } from "../types";

type ThemeName = "obsidian" | "phantom" | "blood" | "frost" | "pink";

interface SettingsPageProps {
  accounts: AccountStatus[];
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: { id: ThemeName; label: string }[];
  notificationPermission: string;
  requestNotificationPermission: () => void;
  navigate: (path: string) => void;
}

export default function SettingsPage({
  accounts,
  theme,
  setTheme,
  themes,
  notificationPermission,
  requestNotificationPermission,
  navigate,
}: SettingsPageProps) {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-7">
      <div className="space-y-5 max-w-md">
        <h1 className="text-lg sm:text-xl font-bold" style={{ color: "var(--text-1)" }}>Pengaturan</h1>

        {/* Theme Picker */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-1)" }}>Color Theme</h3>
          <div className="flex gap-3">
            {themes.map((t) => (
              <button key={t.id} onClick={() => setTheme(t.id)} className="flex flex-col items-center gap-1.5">
                <div className={`theme-dot ${theme === t.id ? "selected" : ""}`} data-t={t.id} style={{ width: 28, height: 28 }} />
                <span className="text-[10px] font-medium" style={{ color: theme === t.id ? "var(--text-1)" : "var(--text-3)" }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="cyber-card p-4">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-1)" }}>Notifikasi</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-1)" }}>Flood Alerts & Disconnects</p>
              <p className="text-[10px]" style={{ color: "var(--text-3)" }}>Dapatkan peringatan limit Telegram secara real-time di desktop.</p>
            </div>
            <button onClick={requestNotificationPermission} className={`btn-ghost px-3 py-1.5 flex items-center gap-1.5 text-xs ${notificationPermission === "granted" ? "opacity-50 cursor-default" : ""}`}>
              {notificationPermission === "granted" ? <Bell size={13} style={{ color: "#34d399" }} /> : <BellOff size={13} style={{ color: "#fb7185" }} />}
              <span>{notificationPermission === "granted" ? "Diizinkan" : notificationPermission === "denied" ? "Ditolak" : "Izinkan"}</span>
            </button>
          </div>
        </div>

        {/* Accounts List Navigation */}
        {accounts.length === 0 ? (
          <div className="cyber-card p-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-2)" }}>Belum ada akun tersimpan.</p>
          </div>
        ) : (
          <div className="cyber-card overflow-hidden">
            {accounts.map((acc, i) => (
              <button
                key={acc.accountId}
                onClick={() => navigate(`/account/${encodeURIComponent(acc.accountId)}`)}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left transition-colors hover:bg-[var(--bg-card-hover)]"
                style={{ borderBottom: i < accounts.length - 1 ? `1px solid var(--border)` : "none" }}
              >
                <div className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "rgba(var(--accent-rgb), 0.1)", color: "var(--accent)" }}>
                  {acc.accountId.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{acc.accountId}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`status-dot ${acc.connected ? "online" : "offline"}`} />
                      <span className="text-xs" style={{ color: acc.connected ? "#34d399" : "var(--text-3)" }}>{acc.connected ? "Connected" : "Offline"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`status-dot ${acc.isActive ? "active" : "offline"}`} />
                      <span className="text-xs" style={{ color: acc.isActive ? "var(--accent)" : "var(--text-3)" }}>{acc.isActive ? "Bot Aktif" : "Bot Mati"}</span>
                    </div>
                  </div>
                </div>
                <span style={{ color: "var(--text-3)" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}