import { useState, useEffect, useCallback } from "react";
import { AccountStatus } from "../types";
import { BRANDING } from "../config/branding.js";

export function useAccounts(isAuthed: boolean) {
  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [isToggling, setIsToggling] = useState(false);

  // Form tambah akun / OTP
  const [showAddForm, setShowAddForm] = useState(false);
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

  const loadConfig = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const data = await fetch("/api/config").then((r) => r.json());
      setIsConnected(Boolean(data.connected));
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch {}
  }, [isAuthed]);

  useEffect(() => {
    loadConfig();
    const interval = setInterval(loadConfig, 5000);
    return () => clearInterval(interval);
  }, [loadConfig]);

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

  const handleImportAll = async (
    file: File,
  ): Promise<{ success: boolean; message?: string }> => {
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
        return {
          success: true,
          message: resData.message || "Berhasil mengimpor seluruh konfigurasi!",
        };
      } else {
        return {
          success: false,
          message: resData.error || "Gagal mengimpor konfigurasi",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Error membaca file JSON: ${err.message}`,
      };
    }
  };

  return {
    accounts,
    setAccounts,
    isConnected,
    isToggling,
    isAllActive,
    loadConfig,
    removeAccount,
    handleToggleAll,
    handleExportAll,
    handleImportAll,
    // Form & OTP
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
  };
}
