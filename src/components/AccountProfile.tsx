import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Trash2,
  AlertCircle,
  Loader2,
  Power,
  Pencil,
  Check,
  X,
  Phone,
  AtSign,
  User,
  RefreshCw,
} from "lucide-react";

import {
  BotSettings,
  BroadcastJob,
  ResponseRule,
  ResolvedTarget,
  AccountInfo,
  AccountStatus,
  HealthInfo,
  DEFAULT_AI_PROMPT,
  defaultSettings,
  migrateResponses,
} from "./account-profile/types";

import {
  ResponseRuleModal,
  BroadcastJobModal,
  DeleteAccountModal,
  GroupDetailModal,
  KeywordDetailModal,
  HealthAnalyzerSection,
  TargetGroupsSection,
  AutoReplyRulesSection,
  AiPromptSection,
  AllowedSendersSection,
  FilterWordsSection,
  BroadcastFilterWordsSection,
  AutoBroadcasterSection,
  BotPreferencesSection,
  BackupRestoreSection,
} from "./account-profile";

export default function AccountProfile({
  account,
  onBack,
  onDelete,
  onRename,
  onRefresh,
}: {
  account: AccountStatus | undefined;
  onBack: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onRename: (newId: string) => void;
  onRefresh?: () => void;
}) {
  /* ── Core state ── */
  const [settings, setSettings] = useState<BotSettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  /* ── Health & Refresh ── */
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* ── Rename ── */
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState("");
  const [isRenameSaving, setIsRenameSaving] = useState(false);

  /* ── Target resolver ── */
  const [targetInput, setTargetInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedTarget | null>(null);
  const [resolveError, setResolveError] = useState("");

  /* ── Response Rule Modal ── */
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ResponseRule | null>(null);

  /* ── Filter Words + AI ── */
  const [filterInput, setFilterInput] = useState("");
  const [filterAiLoading, setFilterAiLoading] = useState(false);
  const [filterAiSuggestions, setFilterAiSuggestions] = useState<string[]>([]);
  const [filterSelected, setFilterSelected] = useState<Set<string>>(new Set());
  const [broadcastFilterInput, setBroadcastFilterInput] = useState("");

  /* ── Allowed Senders ── */
  const [senderInput, setSenderInput] = useState("");

  /* ── Backup & Restore ── */
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState("");

  /* ── Auto Broadcaster ── */
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [editingJob, setEditingJob] = useState<BroadcastJob | null>(null);
  const [broadcastSaving, setBroadcastSaving] = useState(false);
  const [togglingJob, setTogglingJob] = useState<string | null>(null);

  /* ── Delete Modal State ── */
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  /* ── Group Detail Modal ── */
  const [groupDetailTarget, setGroupDetailTarget] = useState<string | null>(null);

  /* ── Keyword Detail Modal ── */
  const [keywordDetailRule, setKeywordDetailRule] = useState<ResponseRule | null>(null);

  /* ── AI Prompt ── */
  const [aiPromptText, setAiPromptText] = useState("");
  const [aiPromptSaving, setAiPromptSaving] = useState(false);
  const [aiPromptSaved, setAiPromptSaved] = useState(false);
  const aiPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accountId = account?.accountId;

  const fetchHealth = async () => {
    if (!accountId) return;
    setCheckingHealth(true);
    try {
      const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/health`);
      if (r.ok) {
        const data = await r.json();
        setHealthInfo(data);
      }
    } catch (e) {
      console.error("Gagal fetch kesehatan bot:", e);
    } finally {
      setCheckingHealth(false);
    }
  };

  const doRefreshBot = async () => {
    if (!accountId) return;
    setIsRefreshing(true);
    try {
      const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/refresh`, {
        method: "POST",
      });
      const data = await r.json();
      if (r.ok) {
        alert(data.message || "Bot berhasil direfresh dan direconnect!");
        fetchHealth();
        if (onRefresh) onRefresh();
      } else {
        alert("Gagal refresh bot: " + (data.error || "Error tidak diketahui"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [pingingGroup, setPingingGroup] = useState<Record<string, boolean>>({});

  const testPingGroup = async (targetId: string) => {
    if (!accountId) return;
    setPingingGroup((prev) => ({ ...prev, [targetId]: true }));
    try {
      const r = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/test-ping-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: targetId }),
      });
      const data = await r.json();
      if (r.ok) {
        alert(data.message || "Berhasil mengirim dan menghapus ping!");
        fetchHealth();
      } else {
        alert("Gagal melakukan ping test: " + (data.error || "Error tidak diketahui"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setPingingGroup((prev) => ({ ...prev, [targetId]: false }));
    }
  };

  useEffect(() => {
    if (accountId) {
      fetchHealth();
    }
  }, [accountId]);

  /* ── Load settings & account info ── */
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/account/${encodeURIComponent(accountId)}/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") {
          setSettings({
            ...defaultSettings,
            ...data,
            responses: migrateResponses(data.responses || []),
          });
          if (typeof data.aiPrompt === "string" && data.aiPrompt.trim() !== "") {
            setAiPromptText(data.aiPrompt);
          } else {
            setAiPromptText(DEFAULT_AI_PROMPT);
          }
        }
      })
      .catch(() => {});

    fetch(`/api/account/${encodeURIComponent(accountId)}/info`)
      .then((r) => r.json())
      .then((data) => {
        if (data) setAccountInfo(data);
      })
      .catch(() => {});
  }, [accountId]);

  /* ── Persist helper ── */
  const saveSetting = async (newSetting: BotSettings) => {
    if (!accountId) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const r = await fetch(
        `/api/account/${encodeURIComponent(accountId)}/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSetting),
        },
      );
      if (r.ok) {
        const updated = await r.json().catch(() => newSetting);
        setSettings(updated);
        onRefresh?.();
      } else {
        const d = await r.json().catch(() => ({}));
        setSaveError(d?.error || "Gagal menyimpan pengaturan");
      }
    } catch {
      setSaveError("Tidak bisa terhubung ke server");
    } finally {
      setIsSaving(false);
    }
  };

  /* ── AI Prompt Save ── */
  const saveAiPrompt = async (promptValue: string) => {
    if (!accountId) return;
    setAiPromptSaving(true);
    try {
      const newSettings = { ...settings, aiPrompt: promptValue };
      const r = await fetch(
        `/api/account/${encodeURIComponent(accountId)}/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSettings),
        },
      );
      if (r.ok) {
        setSettings(newSettings);
        setAiPromptSaved(true);
        if (aiPromptTimerRef.current) clearTimeout(aiPromptTimerRef.current);
        aiPromptTimerRef.current = setTimeout(() => setAiPromptSaved(false), 3000);
      }
    } catch (e) {
      console.error("Gagal simpan prompt AI:", e);
    } finally {
      setAiPromptSaving(false);
    }
  };

  /* ── Response Rules CRUD ── */
  const handleSaveRule = (rule: ResponseRule) => {
    const current = settings.responses || [];
    const idx = current.findIndex((r) => r.id === rule.id);
    const updated =
      idx >= 0
        ? current.map((r) => (r.id === rule.id ? rule : r))
        : [...current, rule];
    saveSetting({ ...settings, responses: updated });
    setShowRuleModal(false);
    setEditingRule(null);
  };

  const removeResponse = (ruleId: string) => {
    const updated = (settings.responses || []).filter((r) => r.id !== ruleId);
    saveSetting({ ...settings, responses: updated });
  };

  /* ── Broadcaster CRUD ── */
  const saveBroadcastJob = async (job: BroadcastJob) => {
    if (!accountId) return;
    setBroadcastSaving(true);
    try {
      const r = await fetch(
        `/api/account/${encodeURIComponent(accountId)}/broadcast-jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(job),
        },
      );
      if (r.ok) {
        const current = settings.broadcastJobs || [];
        const idx = current.findIndex((j) => j.id === job.id);
        const updated =
          idx >= 0
            ? current.map((j) => (j.id === job.id ? job : j))
            : [...current, job];
        setSettings((prev) => ({ ...prev, broadcastJobs: updated }));
        setShowBroadcastModal(false);
        setEditingJob(null);
      } else {
        const d = await r.json().catch(() => ({}));
        alert("Gagal menyimpan broadcast job: " + (d?.error || "Error"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setBroadcastSaving(false);
    }
  };

  const toggleBroadcastJob = async (jobId: string) => {
    if (!accountId) return;
    setTogglingJob(jobId);
    try {
      const r = await fetch(
        `/api/account/${encodeURIComponent(accountId)}/broadcast-jobs/${encodeURIComponent(jobId)}/toggle`,
        { method: "POST" },
      );
      if (r.ok) {
        const d = await r.json();
        setSettings((prev) => ({
          ...prev,
          broadcastJobs: (prev.broadcastJobs || []).map((j) =>
            j.id === jobId ? { ...j, isActive: d.isActive } : j,
          ),
        }));
      }
    } catch (err: any) {
      alert("Gagal toggle job: " + err.message);
    } finally {
      setTogglingJob(null);
    }
  };

  const deleteBroadcastJob = async (jobId: string) => {
    if (!accountId) return;
    if (!confirm("Hapus broadcast job ini?")) return;
    await fetch(
      `/api/account/${encodeURIComponent(accountId)}/broadcast-jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE" },
    );
    setSettings((prev) => ({
      ...prev,
      broadcastJobs: (prev.broadcastJobs || []).filter((j) => j.id !== jobId),
    }));
  };

  /* ── Filter Words ── */
  const addFilterWords = (words: string[]) => {
    const current = settings.filterWords || [];
    const validWords: string[] = [];
    let hasSymbolWarning = false;

    for (const raw of words) {
      const w = raw.toLowerCase().trim();
      if (!w) continue;
      if (w === "@" || (w.length === 1 && !/[a-z0-9]/i.test(w)) || /^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(w)) {
        hasSymbolWarning = true;
        continue;
      }
      validWords.push(w);
    }

    if (hasSymbolWarning) {
      alert("⚠️ Peringatan: Simbol tunggal seperti '@' tidak boleh dijadikan Kata Terlarang karena akan memblokir semua pesan calon pembeli yang menyertakan username!");
    }

    const unique = Array.from(new Set([...current, ...validWords]));
    saveSetting({ ...settings, filterWords: unique });
  };

  const removeFilterWord = (word: string) =>
    saveSetting({
      ...settings,
      filterWords: (settings.filterWords || []).filter((w) => w !== word),
    });

  const addBroadcastFilterWords = (words: string[]) => {
    const current = settings.broadcastFilterWords || [];
    const validWords: string[] = [];
    let hasSymbolWarning = false;

    for (const raw of words) {
      const w = raw.toLowerCase().trim();
      if (!w) continue;
      if (w === "@" || (w.length === 1 && !/[a-z0-9]/i.test(w)) || /^[@#.,!?:;/\\~`*^%$+=_-]+$/.test(w)) {
        hasSymbolWarning = true;
        continue;
      }
      validWords.push(w);
    }

    if (hasSymbolWarning) {
      alert("⚠️ Peringatan: Simbol tunggal seperti '@' tidak boleh dijadikan Kata Terlarang!");
    }

    const unique = Array.from(new Set([...current, ...validWords]));
    saveSetting({ ...settings, broadcastFilterWords: unique });
  };

  const removeBroadcastFilterWord = (word: string) =>
    saveSetting({
      ...settings,
      broadcastFilterWords: (settings.broadcastFilterWords || []).filter((w) => w !== word),
    });

  const addManualBroadcastFilterWord = () => {
    if (!broadcastFilterInput.trim()) return;
    addBroadcastFilterWords(
      broadcastFilterInput
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    );
    setBroadcastFilterInput("");
  };

  const generateFilterVariants = async () => {
    const word = filterInput.trim();
    if (!word) return;
    setFilterAiLoading(true);
    setFilterAiSuggestions([]);
    setFilterSelected(new Set());
    try {
      const r = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blocked", input: word }),
      });
      const data = await r.json();
      const suggestions: string[] = Array.isArray(data.result) ? data.result : [];
      setFilterAiSuggestions(
        suggestions.filter((s) => !(settings.filterWords || []).includes(s)),
      );
    } catch {
      alert("Gagal mengambil saran AI");
    } finally {
      setFilterAiLoading(false);
    }
  };

  const toggleFilterSuggestion = (word: string) =>
    setFilterSelected((prev) => {
      const n = new Set(prev);
      n.has(word) ? n.delete(word) : n.add(word);
      return n;
    });

  const addSelectedFilterWords = () => {
    addFilterWords(Array.from(filterSelected));
    setFilterSelected(new Set());
    setFilterAiSuggestions([]);
    setFilterInput("");
  };

  const addManualFilterWord = () => {
    if (!filterInput.trim()) return;
    addFilterWords(
      filterInput
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    );
    setFilterInput("");
    setFilterAiSuggestions([]);
    setFilterSelected(new Set());
  };

  /* ── Allowed Senders ── */
  const addAllowedSender = () => {
    if (!senderInput.trim()) return;
    const newSenders = senderInput
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const unique = Array.from(
      new Set([...(settings.allowedSenders || []), ...newSenders]),
    );
    saveSetting({ ...settings, allowedSenders: unique });
    setSenderInput("");
  };

  const removeAllowedSender = (sender: string) =>
    saveSetting({
      ...settings,
      allowedSenders: (settings.allowedSenders || []).filter(
        (s) => s !== sender,
      ),
    });

  /* ── Rename ── */
  const doRename = async () => {
    if (!accountId) return;
    const newId = renameInput.trim();
    if (!newId || newId === accountId) {
      setIsRenaming(false);
      return;
    }
    setIsRenameSaving(true);
    setRenameError("");
    try {
      const r = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newId }),
        },
      );
      if (r.ok) {
        setIsRenaming(false);
        onRename(newId);
      } else {
        const d = await r.json().catch(() => ({}));
        setRenameError(d?.error || "Gagal rename");
      }
    } catch {
      setRenameError("Tidak bisa terhubung ke server");
    } finally {
      setIsRenameSaving(false);
    }
  };

  /* ── Target Resolver ── */
  const resolveTarget = async () => {
    if (!targetInput.trim() || !accountId) return;
    setResolving(true);
    setResolved(null);
    setResolveError("");
    try {
      const r = await fetch(
        `/api/account/${encodeURIComponent(accountId)}/resolve-target`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: targetInput.trim() }),
        },
      );
      if (r.ok) setResolved(await r.json());
      else {
        const d = await r.json().catch(() => ({}));
        setResolveError(d?.error || "Gagal resolve target");
      }
    } catch {
      setResolveError("Tidak bisa terhubung ke server");
    } finally {
      setResolving(false);
    }
  };

  const confirmAddTarget = async () => {
    const id = resolved?.id || targetInput.trim();
    if (!id) return;
    if ((settings.targetGroups || []).includes(id)) {
      setResolveError("Target sudah ada di daftar");
      return;
    }
    await saveSetting({
      ...settings,
      targetGroups: [...(settings.targetGroups || []), id],
    });
    setTargetInput("");
    setResolved(null);
    setResolveError("");
  };

  const removeTarget = (t: string) =>
    saveSetting({
      ...settings,
      targetGroups: (settings.targetGroups || []).filter((x) => x !== t),
    });

  /* ── Backup & Restore ── */
  const exportSettings = async () => {
    if (!account) return;
    try {
      const r = await fetch(
        `/api/account/${encodeURIComponent(account.accountId)}/export`,
      );
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        setImportError(errData?.error || "Gagal mengekspor konfigurasi akun");
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const safeName = account.accountId.replace(/[^\w\s-]/gi, "_").trim() || "account";
      const a = document.createElement("a");
      a.href = url;
      a.download = `teleoffer-backup-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setImportError("Gagal mengekspor konfigurasi");
    }
  };

  const importSettings = async (file: File) => {
    if (!account) return;
    setImportStatus("");
    setImportError("");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.settings) {
        setImportError(
          "Format file tidak valid — tidak ditemukan field 'settings'",
        );
        return;
      }
      const r = await fetch(
        `/api/account/${encodeURIComponent(account.accountId)}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setImportError(err?.error || "Gagal mengimpor");
        return;
      }
      const result = await r.json();
      setSettings({
        ...result.settings,
        responses: migrateResponses(result.settings.responses || []),
      });
      setImportStatus("Konfigurasi berhasil diimpor ✓");
      setTimeout(() => setImportStatus(""), 4000);
    } catch {
      setImportError("File JSON tidak valid");
    }
  };

  /* ── Early return (must be after all hooks) ── */
  if (!account) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-2 mb-4">Akun tidak ditemukan</p>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-accent hover:underline mx-auto"
          >
            <ArrowLeft size={14} /> Kembali
          </button>
        </div>
      </div>
    );
  }

  const displayName = accountInfo?.firstName
    ? [accountInfo.firstName, accountInfo.lastName].filter(Boolean).join(" ")
    : null;

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="min-h-screen bg-base pb-20 md:pb-0">
      {/* ── Rule Modal ── */}
      {showRuleModal && (
        <ResponseRuleModal
          rule={editingRule}
          onSave={handleSaveRule}
          onClose={() => {
            setShowRuleModal(false);
            setEditingRule(null);
          }}
        />
      )}

      {/* ── Broadcast Job Modal ── */}
      {showBroadcastModal && (
        <BroadcastJobModal
          job={editingJob}
          onSave={saveBroadcastJob}
          onClose={() => {
            setShowBroadcastModal(false);
            setEditingJob(null);
          }}
          saving={broadcastSaving}
        />
      )}

      {/* ── Delete Modal ── */}
      <DeleteAccountModal
        accountId={account.accountId}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDelete={onDelete}
      />

      {/* ── Group Detail Modal ── */}
      <GroupDetailModal
        targetId={groupDetailTarget}
        healthInfo={healthInfo}
        onClose={() => setGroupDetailTarget(null)}
      />

      {/* ── Keyword Detail Modal ── */}
      <KeywordDetailModal
        rule={keywordDetailRule}
        accountId={accountId}
        healthInfo={healthInfo}
        onClose={() => setKeywordDetailRule(null)}
      />

      {/* ── Top Bar ── */}
      <div
        className="bg-card border-theme sticky top-0 z-10"
        style={{ borderBottomWidth: "1px" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-7 py-3 flex items-center gap-2 sm:gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-card-hover rounded-xl transition text-2 shrink-0"
          >
            <ArrowLeft size={17} />
          </button>

          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
            style={{
              background: "rgba(var(--accent-rgb), 0.1)",
              color: "var(--accent)",
              border: "1px solid rgba(var(--accent-rgb), 0.15)",
            }}
          >
            {account.accountId.charAt(0).toUpperCase()}
          </div>

          {/* Name + Rename */}
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doRename();
                    if (e.key === "Escape") {
                      setIsRenaming(false);
                      setRenameError("");
                    }
                  }}
                  className="input-cyber h-7 px-2 text-sm font-semibold w-28 sm:w-36"
                  autoFocus
                />
                <button
                  onClick={doRename}
                  disabled={isRenameSaving}
                  className="btn-accent p-1.5 rounded-lg disabled:opacity-60 flex items-center justify-center"
                >
                  {isRenameSaving ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Check size={11} />
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsRenaming(false);
                    setRenameError("");
                  }}
                  className="btn-ghost p-1.5 rounded-lg"
                >
                  <X size={11} />
                </button>
                {renameError && (
                  <span className="text-xs text-red-500 hidden sm:inline">
                    {renameError}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-bold text-1 truncate">
                  {account.accountId}
                </p>
                <button
                  onClick={() => {
                    setRenameInput(account.accountId);
                    setIsRenaming(true);
                  }}
                  className="p-1 text-3 hover:text-accent transition shrink-0"
                  title="Rename akun"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <div
                className={`status-dot ${account.connected ? "online" : "offline"}`}
              />
              <span
                className={`text-xs ${account.connected ? "text-[#34d399]" : "text-3"}`}
              >
                {account.connected ? "Connected" : "Offline"}
              </span>
            </div>
          </div>

          {/* Start / Stop Bot */}
          <button
            onClick={async () => {
              const nextActive = !settings.isActive;
              await saveSetting({ ...settings, isActive: nextActive });
              if (nextActive && !account.connected) {
                doRefreshBot();
              }
            }}
            disabled={isSaving}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-60 shrink-0 ${
              settings.isActive
                ? "bg-[rgba(244,63,94,0.1)] text-[#f43f5e] border border-[rgba(244,63,94,0.2)] hover:bg-[rgba(244,63,94,0.2)]"
                : "bg-[rgba(16,185,129,0.1)] text-[#34d399] border border-[rgba(16,185,129,0.2)] hover:bg-[rgba(16,185,129,0.2)]"
            }`}
          >
            <Power size={13} />
            <span className="hidden sm:inline">
              {settings.isActive ? "Stop Bot" : "Start Bot"}
            </span>
          </button>

          {/* Refresh / Reconnect Bot */}
          <button
            onClick={doRefreshBot}
            disabled={isRefreshing}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold transition shrink-0 ${
              account.connected
                ? "bg-card border border-theme hover:bg-card-hover text-2"
                : "bg-[rgba(59,130,246,0.15)] text-[#60a5fa] border border-[rgba(59,130,246,0.3)] hover:bg-[rgba(59,130,246,0.25)]"
            } disabled:opacity-50`}
            title={account.connected ? "Refresh koneksi bot Telegram" : "Hubungkan ulang (reconnect) bot ke Telegram"}
          >
            {isRefreshing ? (
              <Loader2 size={13} className="animate-spin text-accent" />
            ) : (
              <RefreshCw size={13} className={account.connected ? "text-accent" : "text-[#60a5fa]"} />
            )}
            <span className="hidden sm:inline">
              {account.connected ? "Refresh Bot" : "Reconnect Bot"}
            </span>
          </button>

          {/* Delete */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-2 text-3 hover:text-[#f43f5e] hover:bg-[rgba(244,63,94,0.1)] rounded-xl transition shrink-0"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Account info bar */}
        {accountInfo &&
          (accountInfo.phone || accountInfo.username || displayName) && (
            <div className="max-w-5xl mx-auto px-4 sm:px-7 pb-2.5 flex items-center gap-3 sm:gap-4 flex-wrap">
              {displayName && (
                <div className="flex items-center gap-1.5 text-xs text-2">
                  <User size={11} className="text-accent" />
                  <span>{displayName}</span>
                </div>
              )}
              {accountInfo.username && (
                <div className="flex items-center gap-1.5 text-xs text-2">
                  <AtSign size={11} className="text-accent" />
                  <span>{accountInfo.username}</span>
                </div>
              )}
              {accountInfo.phone && (
                <div className="flex items-center gap-1.5 text-xs text-2">
                  <Phone size={11} className="text-accent" />
                  <span>+{accountInfo.phone}</span>
                </div>
              )}
            </div>
          )}
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-7 py-5 sm:py-6 space-y-4 sm:space-y-5">
        {saveError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-[rgba(244,63,94,0.08)] border border-[rgba(244,63,94,0.2)] rounded-xl text-sm text-[#fb7185]">
            <AlertCircle size={14} className="shrink-0" /> {saveError}
          </div>
        )}

        {/* 1. Health Analyzer */}
        <HealthAnalyzerSection
          healthInfo={healthInfo}
          checkingHealth={checkingHealth}
          fetchHealth={fetchHealth}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* 2. Target Groups */}
          <TargetGroupsSection
            targetGroups={settings.targetGroups || []}
            targetInput={targetInput}
            setTargetInput={setTargetInput}
            resolving={resolving}
            resolved={resolved}
            setResolved={setResolved}
            resolveError={resolveError}
            setResolveError={setResolveError}
            isSaving={isSaving}
            isConnected={account.connected}
            accountId={accountId}
            healthInfo={healthInfo}
            pingingGroup={pingingGroup}
            resolveTarget={resolveTarget}
            confirmAddTarget={confirmAddTarget}
            removeTarget={removeTarget}
            testPingGroup={testPingGroup}
            onOpenGroupDetail={(t) => setGroupDetailTarget(t)}
          />

          {/* 3. Auto Reply Rules */}
          <AutoReplyRulesSection
            responses={settings.responses || []}
            isSaving={isSaving}
            accountId={accountId}
            healthInfo={healthInfo}
            onAddRule={() => {
              setEditingRule(null);
              setShowRuleModal(true);
            }}
            onEditRule={(rule) => {
              setEditingRule(rule);
              setShowRuleModal(true);
            }}
            onDeleteRule={removeResponse}
            onOpenKeywordDetail={(rule) => setKeywordDetailRule(rule)}
          />

          {/* 4. AI Prompt */}
          <AiPromptSection
            aiPromptText={aiPromptText}
            setAiPromptText={setAiPromptText}
            aiPromptSaving={aiPromptSaving}
            aiPromptSaved={aiPromptSaved}
            saveAiPrompt={saveAiPrompt}
          />

          {/* 5. Allowed Senders */}
          <AllowedSendersSection
            allowedSendersEnabled={settings.allowedSendersEnabled}
            allowedSenders={settings.allowedSenders || []}
            senderInput={senderInput}
            setSenderInput={setSenderInput}
            isSaving={isSaving}
            onToggleEnabled={(enabled) =>
              saveSetting({ ...settings, allowedSendersEnabled: enabled })
            }
            onAddSender={addAllowedSender}
            onRemoveSender={removeAllowedSender}
          />

          {/* 6. Filter Words */}
          <FilterWordsSection
            filterWordsEnabled={settings.filterWordsEnabled}
            filterWords={settings.filterWords || []}
            filterInput={filterInput}
            setFilterInput={setFilterInput}
            filterAiLoading={filterAiLoading}
            filterAiSuggestions={filterAiSuggestions}
            filterSelected={filterSelected}
            isSaving={isSaving}
            onToggleEnabled={(enabled) =>
              saveSetting({ ...settings, filterWordsEnabled: enabled })
            }
            onAddManual={addManualFilterWord}
            onGenerateVariants={generateFilterVariants}
            onToggleSuggestion={toggleFilterSuggestion}
            onAddSelected={addSelectedFilterWords}
            onCloseSuggestions={() => {
              setFilterAiSuggestions([]);
              setFilterSelected(new Set());
            }}
            onRemoveWord={removeFilterWord}
          />

          {/* 7. Broadcast Filter Words */}
          <BroadcastFilterWordsSection
            broadcastFilterWordsEnabled={settings.broadcastFilterWordsEnabled}
            broadcastFilterWords={settings.broadcastFilterWords || []}
            broadcastFilterInput={broadcastFilterInput}
            setBroadcastFilterInput={setBroadcastFilterInput}
            isSaving={isSaving}
            onToggleEnabled={(enabled) =>
              saveSetting({ ...settings, broadcastFilterWordsEnabled: enabled })
            }
            onAddManual={addManualBroadcastFilterWord}
            onRemoveWord={removeBroadcastFilterWord}
          />

          {/* 8. Auto Broadcaster */}
          <AutoBroadcasterSection
            broadcastJobs={settings.broadcastJobs || []}
            togglingJob={togglingJob}
            toggleBroadcastJob={toggleBroadcastJob}
            deleteBroadcastJob={deleteBroadcastJob}
            onAddJob={() => {
              setEditingJob(null);
              setShowBroadcastModal(true);
            }}
            onEditJob={(job) => {
              setEditingJob(job);
              setShowBroadcastModal(true);
            }}
          />

          {/* 9. Bot Preferences */}
          <BotPreferencesSection
            settings={settings}
            setSettings={setSettings}
            saveSetting={saveSetting}
            isSaving={isSaving}
          />

          {/* 10. Backup & Restore */}
          <BackupRestoreSection
            exportSettings={exportSettings}
            importSettings={importSettings}
            importStatus={importStatus}
            importError={importError}
            accountId={account.accountId}
          />
        </div>
      </div>
    </div>
  );
}
