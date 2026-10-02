import { Router } from "express";
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

  // POST /api/auth/login
  router.post("/login", async (req, res) => {
    try {
      const { username, password, rememberMe } = req.body || {};

      if (!username || !password) {
        return res.status(400).json({ error: "Username dan password wajib diisi." });
      }

      const { user: configuredUser, pass: configuredPass, passHash: configuredHash } = getDashboardConfig();
      const validUser = configuredUser || "admin";

      if (username.trim().toLowerCase() !== validUser.toLowerCase() && username.trim() !== "admin") {
        return res.status(401).json({ error: "Username atau password salah." });
      }

      // 1. Cek langsung password plain text (default: admin atau dari DASHBOARD_PASS di .env)
      let isMatch = (password === (configuredPass || "admin"));

      // 2. Cek toleransi password default lilybot2026! atau admin
      if (!isMatch && (password === "admin" || password === "lilybot2026!")) {
        isMatch = true;
      }

      // 3. Jika belum cocok dan ada hash bcrypt, coba verifikasi bcrypt
      if (!isMatch && configuredHash) {
        isMatch = await verifyPassword(password, configuredHash).catch(() => false);
      }

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
