// src/components/DashboardWidgets.tsx
import { Zap } from "lucide-react";
import { AccountStatus } from "../types";

// src/components/DashboardWidgets.tsx

export function StatCard({
  icon,
  label,
  value,
  className = "",
  subBadges,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  className?: string;
  subBadges?: React.ReactNode;
}) {
  return (
    <div
      className={`cyber-card accent-top p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(var(--accent-rgb),0.15)] hover:border-accent/40 group cursor-default flex flex-col justify-between ${className}`}
    >
      <div>
        <div
          className="flex items-center gap-2 mb-2 sm:mb-3 text-[11px] sm:text-xs font-semibold uppercase tracking-wide group-hover:brightness-125 transition-all duration-300"
          style={{ color: "var(--accent)" }}
        >
          {icon}
          <span>{label}</span>
        </div>
        <p
          className="text-2xl sm:text-3xl font-bold group-hover:scale-[1.02] transition-transform duration-300 origin-left"
          style={{ color: "var(--text-1)" }}
        >
          {value}
        </p>
      </div>
      {subBadges && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-[var(--border)]">
          {subBadges}
        </div>
      )}
    </div>
  );
}

export function AccountCard({
  account,
  onClick,
}: {
  account: AccountStatus;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="cyber-card p-4 text-left group active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 transition-all"
          style={{
            background: "rgba(var(--accent-rgb), 0.08)",
            color: "var(--accent)",
            border: "1px solid rgba(var(--accent-rgb), 0.1)",
          }}
        >
          {account.accountId.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-1)" }}
          >
            {account.accountId}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <div
                className={`status-dot ${account.connected ? "online" : "offline"}`}
              />
              <span
                className="text-xs"
                style={{
                  color: account.connected ? "#34d399" : "var(--text-3)",
                }}
              >
                {account.connected ? "Connected" : "Offline"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className={`status-dot ${account.isActive ? "active" : "offline"}`}
              />
              <span
                className="text-xs"
                style={{
                  color: account.isActive ? "var(--accent)" : "var(--text-3)",
                }}
              >
                {account.isActive ? "Bot Aktif" : "Bot Mati"}
              </span>
            </div>
          </div>
        </div>
        <span className="transition-colors" style={{ color: "var(--text-3)" }}>
          ›
        </span>
      </div>
    </button>
  );
}

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-16 sm:py-20">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse-glow"
        style={{
          background: "rgba(var(--accent-rgb), 0.08)",
          border: "1px solid rgba(var(--accent-rgb), 0.15)",
        }}
      >
        <Zap className="w-7 h-7" style={{ color: "var(--accent)" }} />
      </div>
      <h3
        className="text-base font-semibold mb-1"
        style={{ color: "var(--text-1)" }}
      >
        Belum ada akun
      </h3>
      <p className="text-sm mb-5" style={{ color: "var(--text-2)" }}>
        Tambahkan akun Telegram untuk mulai menggunakan bot.
      </p>
      <button onClick={onAdd} className="btn-accent px-5 py-2.5 text-sm">
        Tambah Akun Pertama
      </button>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        className="text-xs font-semibold mb-1.5 block"
        style={{ color: "var(--text-2)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-cyber w-full h-11 sm:h-10 px-3"
      />
    </div>
  );
}
