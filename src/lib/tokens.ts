import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessTokenPayload {
  sub: string; // userId
}

export function signAccessToken(userId: string): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not set");
  // Deliberately minimal claims (§4): never store roles/permissions here,
  // always re-check them server-side against the DB.
  return jwt.sign({ sub: userId }, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not set");
  return jwt.verify(token, secret) as AccessTokenPayload;
}

/** Opaque random string given to the client; only the hash is stored server-side. */
export function generateRefreshToken(): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return { token, expiresAt };
}

export function hashRefreshToken(token: string): string {
  const pepper = process.env.JWT_REFRESH_PEPPER ?? "";
  return createHash("sha256").update(token + pepper).digest("hex");
}

export function deviceLabelFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown device";
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/android/i.test(userAgent)) return "Android device";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Unknown device";
}
