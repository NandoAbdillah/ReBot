import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
} from "../backend/config/auth.js";

describe("backend auth & session security", () => {
  it("should hash and verify passwords with bcrypt", async () => {
    const plain = "lilybotSecret2026!";
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^\$2[aby]\$/);

    const matchValid = await verifyPassword(plain, hash);
    expect(matchValid).toBe(true);

    const matchInvalid = await verifyPassword("wrongPassword", hash);
    expect(matchInvalid).toBe(false);
  });

  it("should sign and verify valid session tokens", () => {
    const username = "admin";
    const { token } = signSession(username, false);

    expect(token).toContain(".");
    const session = verifySession(token);

    expect(session).not.toBeNull();
    expect(session?.username).toBe(username);
    expect(session?.exp).toBeGreaterThan(Date.now());
  });

  it("should reject tampered session tokens", () => {
    const { token } = signSession("admin", false);
    const [payload, sig] = token.split(".");

    // Tamper with payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ username: "hacker", exp: Date.now() + 10000 }),
    ).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${sig}`;

    const session = verifySession(tamperedToken);
    expect(session).toBeNull();
  });

  it("should reject empty or malformed tokens", () => {
    expect(verifySession("")).toBeNull();
    expect(verifySession("malformed-token")).toBeNull();
    expect(verifySession("invalid.extra.dots")).toBeNull();
  });
});
