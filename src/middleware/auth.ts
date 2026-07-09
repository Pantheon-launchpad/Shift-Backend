import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens";
import { unauthorized } from "../lib/errors";
import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export type AuthedRequest = Request & { userId: string };

export function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

/**
 * Verifies the Bearer access token and re-checks the user still exists in
 * the DB on every request (§4: never trust claims beyond user id, since a
 * revoked account shouldn't be able to keep acting on a still-valid token).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    const token = header.slice("Bearer ".length);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw unauthorized("Access token is invalid or expired.");
    }

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) throw unauthorized("Account no longer exists.");

    (req as AuthedRequest).userId = user.id;
    next();
  } catch (err) {
    next(err);
  }
}
