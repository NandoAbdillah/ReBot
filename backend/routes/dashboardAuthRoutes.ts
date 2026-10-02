import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  verifyPassword,
  signSession,
  verifySession,
  extractToken,
  SESSION_COOKIE_NAME,
  getDashboardConfig,
} from "../config/auth.js";

export function createDashboardAuthRouter() {
  const router = Router();

  // Rate limiter untuk proteksi brute force login: max 10 percobaan per 15 menit
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Terlalu banyak percobaan login yang gagal. Silakan coba lagi dalam 15 menit.",
    },
  });

  // POST /api/auth/login
  router.post("/login", loginLimiter, async (req, res) => {
    try {
      const { username, password, rememberMe } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: "Username dan password wajib diisi." });
      }

      const { user: configuredUser, passHash: configuredHash } = getDashboardConfig();

      // Jika hash belum dikonfigurasi di .env, gunakan default safe fallback untuk kemudahan setup pertama kali
      // Default: admin / lilybot2026! ($2a$10$r9jD/nF6N4h7xS9z5F0g1Ozp6W2f3M8tL5qK0J9vE1b7kY4nO3s8m)
      const validUser = configuredUser || "admin";
      const validHash =
        configuredHash ||
        "$2a$10$oXk8m9U15wQ4uVlR8wW2ceF9Wj4eNfxb0N8n9i7Y0Z9gX8.vM66iG"; // bcrypt hash of "lilybot2026!"

      if (username.trim() !== validUser) {
        return res.status(401).json({ error: "Username atau password salah." });
      }

      const isMatch = await verifyPassword(password, validHash);
      if (!isMatch) {
        return res.status(401).json({ error: "Username atau password salah." });
      }

      const { token, maxAgeMs } = signSession(validUser, Boolean(rememberMe));

      // Pasang cookie httpOnly
      res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: maxAgeMs,
        path: "/",
      });

      return res.json({
        success: true,
        username: validUser,
        token,
      });
    } catch (err: any) {
      console.error("[AUTH] Login error:", err);
      return res.status(500).json({ error: "Terjadi kesalahan internal server saat login." });
    }
  });

  // GET /api/auth/session
  router.get("/session", (req, res) => {
    const token = extractToken(req);
    if (!token) {
      return res.json({ authenticated: false });
    }

    const session = verifySession(token);
    if (!session) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      username: session.username,
    });
  });

  // POST /api/auth/logout
  router.post("/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return res.json({ success: true, message: "Berhasil logout." });
  });

  return router;
}
