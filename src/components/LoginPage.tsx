import { useState } from "react";
import { Eye, EyeOff, Shield, Sparkles, Heart } from "lucide-react";
import { motion } from "motion/react";
import { BRANDING } from "../config/branding.js";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Harap isi username dan password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Gagal masuk. Periksa kembali kredensial Anda.");
        setLoading(false);
        return;
      }

      // Login berhasil
      onLogin();
    } catch (err: any) {
      setError("Gagal terhubung ke server. Pastikan server aktif.");
      setLoading(false);
    }
  };

  const stagger = {
    hidden: { opacity: 0, y: 16 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as any },
    }),
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden select-none"
      style={{
        background:
          "linear-gradient(135deg, #fff1f4 0%, #fdf2f8 35%, #fff5f7 70%, #fce7f3 100%)",
      }}
    >
      {/* Background Soft Blobs & Ambient Lights */}
      <div className="absolute top-[-10%] right-[-5%] w-[450px] h-[450px] rounded-full bg-pink-200/40 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[450px] h-[450px] rounded-full bg-rose-200/35 blur-[120px] pointer-events-none" />
      <div className="absolute top-[35%] left-[20%] w-[300px] h-[300px] rounded-full bg-purple-100/30 blur-[100px] pointer-events-none" />

      {/* Floating subtle ambient petals / dots */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-[12%] left-[15%] w-3 h-3 rounded-full bg-pink-300/40 blur-[1px] animate-pulse" />
        <div className="absolute top-[25%] right-[20%] w-4 h-4 rounded-full bg-rose-300/40 blur-[1px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[18%] w-3 h-3 rounded-full bg-pink-400/30 blur-[1px]" />
        <div className="absolute bottom-[28%] left-[22%] w-2 h-2 rounded-full bg-purple-300/40 blur-[1px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[400px] relative z-10"
      >
        {/* Header / Brand Logo */}
        <motion.div
          className="flex flex-col items-center mb-6 text-center"
          custom={0}
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {/* Logo Badge */}
          <div className="relative mb-3 group">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-pink-300 to-rose-300 opacity-60 blur-md group-hover:opacity-100 transition duration-500" />
            <div className="relative w-18 h-18 rounded-3xl bg-white/85 backdrop-blur-md border border-pink-200/80 shadow-[0_8px_20px_rgba(244,114,182,0.18)] flex items-center justify-center p-2.5">
              <img
                src={BRANDING.logoPath}
                alt={BRANDING.productName}
                className="w-full h-full object-contain drop-shadow-sm"
              />
            </div>
            <div className="absolute -top-1 -right-1 bg-pink-500 text-white p-1 rounded-full shadow-sm">
              <Sparkles size={11} />
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-1.5">
            <span>{BRANDING.productName}</span>
            <span className="text-pink-500 text-xs px-2 py-0.5 rounded-full bg-pink-100/80 border border-pink-200 font-semibold tracking-normal">
              v1.0
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {BRANDING.tagline}
          </p>
        </motion.div>

        {/* Frosted Glass Login Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl p-7 space-y-4 backdrop-blur-xl bg-white/75 border border-white/80 shadow-[0_16px_40px_rgba(244,114,182,0.14)]"
          style={{
            boxShadow:
              "0 20px 45px -10px rgba(244, 114, 182, 0.16), 0 0 0 1px rgba(255, 255, 255, 0.8)",
          }}
        >
          <div className="text-center pb-1">
            <h2 className="text-sm font-semibold text-slate-700">
              Selamat Datang Kembali
            </h2>
            <p className="text-[11px] text-slate-400">
              Masuk untuk mengakses dashboard bot Anda
            </p>
          </div>

          {/* Username Input */}
          <motion.div
            custom={1}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Username
            </label>
            <div className="relative">
              <Shield
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-pink-400"
              />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                placeholder="Username admin"
                autoComplete="username"
                className="w-full h-11 pl-10 pr-3 text-xs font-medium rounded-2xl bg-white/90 border border-pink-100 text-slate-800 placeholder-slate-400 shadow-xs focus:outline-none focus:border-pink-400 focus:ring-3 focus:ring-pink-100/70 transition-all"
              />
            </div>
          </motion.div>

          {/* Password Input */}
          <motion.div
            custom={2}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block">
              Kata Sandi
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full h-11 px-3.5 pr-10 text-xs font-medium rounded-2xl bg-white/90 border border-pink-100 text-slate-800 placeholder-slate-400 shadow-xs focus:outline-none focus:border-pink-400 focus:ring-3 focus:ring-pink-100/70 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition p-1 text-slate-400 hover:text-pink-500"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </motion.div>

          {/* Remember Me */}
          <motion.label
            custom={3}
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-2.5 cursor-pointer select-none pt-0.5"
          >
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="sr-only peer"
            />
            <div
              className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                rememberMe
                  ? "bg-pink-500 border-pink-500 text-white shadow-xs shadow-pink-200"
                  : "border-pink-200 bg-white/90"
              }`}
            >
              {rememberMe && (
                <Heart size={10} className="fill-current text-white" />
              )}
            </div>
            <span className="text-xs text-slate-600 font-medium">
              Ingat saya di perangkat ini
            </span>
          </motion.label>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-medium rounded-xl px-3.5 py-2.5 bg-rose-50 border border-rose-200/80 text-rose-600 flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Submit Button */}
          <motion.div
            custom={4}
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="pt-1"
          >
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full h-11 text-white font-semibold text-xs rounded-2xl bg-gradient-to-r from-pink-400 via-rose-400 to-pink-500 hover:from-pink-500 hover:to-rose-500 shadow-md shadow-pink-300/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Dashboard</span>
                  <Sparkles size={13} className="text-pink-100" />
                </>
              )}
            </button>
          </motion.div>
        </form>

        {/* Footer */}
        <motion.div
          custom={5}
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="text-center text-[11px] text-slate-400 mt-6 flex items-center justify-center gap-1 font-medium"
        >
          <span>{BRANDING.productName}</span>
          <span>•</span>
          <span>Telegram Multi-Account Automation</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
