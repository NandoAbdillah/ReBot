import { useState } from "react";
import { Zap, Eye, EyeOff, Shield } from "lucide-react";
import { motion } from "motion/react";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (username === "celiimut" && password === "celiimutbangettz") {
        if (rememberMe) {
          localStorage.setItem("tele-auth", "1");
        } else {
          sessionStorage.setItem("tele-auth", "1");
        }
        onLogin();
      } else {
        setError("Username atau password salah.");
      }
      setLoading(false);
    }, 400);
  };

  const stagger = {
    hidden: { opacity: 0, y: 16 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.45, ease: "easeOut" as any },
    }),
  };

  return (
    <div
      className="sigil-bg min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Geometric sigil decorations - Top-Center */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "4%",
          left: "50%",
          width: "180px",
          height: "180px",
          border: "1px solid var(--border-accent)",
          opacity: 0.15,
          transform: "translateX(-50%) rotate(45deg)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "2%",
          left: "50%",
          width: "220px",
          height: "220px",
          border: "1px solid var(--border-accent)",
          opacity: 0.08,
          transform: "translateX(-50%) rotate(45deg)",
        }}
      />

      {/* Geometric sigil decorations - Bottom-Center */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "6%",
          left: "50%",
          width: "160px",
          height: "160px",
          border: "1px solid var(--border-accent)",
          opacity: 0.12,
          transform: "translateX(-50%) rotate(22.5deg)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "4%",
          left: "50%",
          width: "200px",
          height: "200px",
          border: "1px solid var(--border-accent)",
          opacity: 0.06,
          transform: "translateX(-50%) rotate(22.5deg)",
        }}
      />

      {/* Thin angular crossing lines - centered & elegant */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "15%",
          left: "50%",
          width: "350px",
          height: "1px",
          background: "var(--border-accent)",
          opacity: 0.1,
          transform: "translateX(-50%) rotate(-15deg)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "18%",
          left: "50%",
          width: "300px",
          height: "1px",
          background: "var(--border-accent)",
          opacity: 0.1,
          transform: "translateX(-50%) rotate(15deg)",
        }}
      />

      {/* Center Top and Bottom accent triangles */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0,
          left: "50%",
          width: 0,
          height: 0,
          borderTop: "60px solid rgba(var(--accent-rgb), 0.04)",
          borderLeft: "60px solid transparent",
          borderRight: "60px solid transparent",
          transform: "translateX(-50%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: 0,
          left: "50%",
          width: 0,
          height: 0,
          borderBottom: "60px solid rgba(var(--accent-rgb), 0.04)",
          borderLeft: "60px solid transparent",
          borderRight: "60px solid transparent",
          transform: "translateX(-50%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[380px] relative z-10"
      >
        {/* Logo */}
        <motion.div
          className="flex flex-col items-center mb-8"
          custom={0}
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <div
            className="animate-pulse-glow w-16 h-16 flex items-center justify-center mb-4"
            style={{
              clipPath:
                "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
              background: "var(--accent-gradient)",
            }}
          >
            <Zap className="w-7 h-7 text-white fill-current" />
          </div>
          <h1 className="text-2xl font-bold text-white">TeleOffer</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-2)" }}>
            Masuk untuk melanjutkan
          </p>
        </motion.div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="cyber-card corner-sigil p-6 sm:p-7 space-y-4"
        >
          {/* Username */}
          <motion.div
            custom={1}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            <label
              className="text-xs font-semibold mb-1.5 block"
              style={{ color: "var(--text-2)" }}
            >
              Username
            </label>
            <div className="relative">
              <Shield
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-3)" }}
              />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                placeholder="Username"
                autoComplete="username"
                className="input-cyber w-full h-11 pl-10 pr-3 text-sm"
              />
            </div>
          </motion.div>

          {/* Password */}
          <motion.div
            custom={2}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            <label
              className="text-xs font-semibold mb-1.5 block"
              style={{ color: "var(--text-2)" }}
            >
              Password
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
                className="input-cyber w-full h-11 px-3 pr-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition p-1"
                style={{ color: "var(--text-3)" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </motion.div>

          {/* Remember me */}
          <motion.label
            custom={3}
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-2.5 cursor-pointer select-none"
          >
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only peer"
              />
              <div
                className="w-4 h-4 rounded border transition-colors flex items-center justify-center"
                style={{
                  borderColor: rememberMe
                    ? "var(--accent)"
                    : "var(--border)",
                  backgroundColor: rememberMe
                    ? "var(--accent)"
                    : "transparent",
                }}
              >
                {rememberMe && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    viewBox="0 0 10 8"
                  >
                    <path
                      d="M1 4l3 3 5-6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs" style={{ color: "var(--text-2)" }}>
              Ingat saya di perangkat ini
            </span>
          </motion.label>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-medium rounded-lg px-3 py-2.5"
              style={{
                color: "#f87171",
                backgroundColor: "rgba(127, 29, 29, 0.25)",
                border: "1px solid rgba(220, 38, 38, 0.2)",
              }}
            >
              {error}
            </motion.div>
          )}

          {/* Submit */}
          <motion.div
            custom={4}
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-accent w-full h-11 text-white font-semibold text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
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
                  Memverifikasi...
                </>
              ) : (
                "Masuk →"
              )}
            </button>
          </motion.div>
        </form>

        {/* Footer */}
        <motion.p
          custom={5}
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="text-center text-[11px] mt-6"
          style={{ color: "var(--text-3)" }}
        >
          © 2026 kzndev
        </motion.p>
      </motion.div>
    </div>
  );
}
