import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { Socket } from "socket.io";

export const SESSION_COOKIE_NAME = "lilybot_session";

// Fallback secret for session signing if not explicitly configured in env
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.DASHBOARD_PASS_HASH ||
  "lilybot-blossom-secret-key-2026";

export interface SessionPayload {
  username: string;
  iat: number;
  exp: number;
}

/**
 * Hash password with bcrypt
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/**
 * Verify password against bcrypt hash
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Sign session payload with HMAC-SHA256
 */
export function signSession(
  username: string,
  rememberMe: boolean = false,
): { token: string; maxAgeMs: number } {
  const maxAgeMs = rememberMe
    ? 30 * 24 * 60 * 60 * 1000 // 30 hari
    : 24 * 60 * 60 * 1000; // 1 hari

  const now = Date.now();
  const payload: SessionPayload = {
    username,
    iat: now,
    exp: now + maxAgeMs,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  const token = `${payloadBase64}.${signature}`;
  return { token, maxAgeMs };
}

/**
 * Verify and decode session token
 */
export function verifySession(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr) as SessionPayload;
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract token from request (Cookie or Bearer token header)
 */
export function extractToken(req: Request): string | null {
  if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

/**
 * Express middleware to require authentication on protected routes
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: "Akses ditolak. Sesi tidak ditemukan atau belum login.",
    });
  }

  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({
      error: "Akses ditolak. Sesi tidak valid atau telah kedaluwarsa.",
    });
  }

  (req as any).user = session;
  next();
}

/**
 * Validate Socket.io connection handshake with auth cookie
 */
export function requireAuthForSockets(
  socket: Socket,
  next: (err?: Error) => void,
) {
  const cookieHeader = socket.handshake.headers.cookie;
  let token: string | null = null;

  if (cookieHeader) {
    const cookies = cookieHeader.split(";").reduce(
      (acc, c) => {
        const [k, v] = c.trim().split("=");
        if (k && v) acc[k] = decodeURIComponent(v);
        return acc;
      },
      {} as Record<string, string>,
    );
    token = cookies[SESSION_COOKIE_NAME] || null;
  }

  // Also allow auth token passed in handshake auth object
  if (!token && socket.handshake.auth && socket.handshake.auth.token) {
    token = socket.handshake.auth.token;
  }

  if (!token) {
    return next(new Error("Unauthorized: Cookie sesi tidak ditemukan"));
  }

  const session = verifySession(token);
  if (!session) {
    return next(new Error("Unauthorized: Sesi tidak valid atau kedaluwarsa"));
  }

  (socket as any).user = session;
  next();
}

/**
 * Validates configured environment dashboard credentials
 */
export function getDashboardConfig() {
  const user = process.env.DASHBOARD_USER || "admin";
  const passHash = process.env.DASHBOARD_PASS_HASH;
  return { user, passHash };
}
