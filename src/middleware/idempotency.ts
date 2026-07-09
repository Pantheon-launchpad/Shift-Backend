import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { idempotencyRecords } from "../db/schema";
import { and, eq, lt } from "drizzle-orm";
import type { AuthedRequest } from "./auth";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h, per §3

/**
 * Any POST/PATCH that changes state accepts an Idempotency-Key header.
 * The server caches the response for that key for 24h and replays it on
 * retry instead of re-applying the mutation (so a phone retrying "mark task
 * done" after losing signal mid-request doesn't double-apply it).
 */
export function idempotency() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as AuthedRequest).userId;
    const key = req.header("Idempotency-Key");
    if (!key) return next();

    try {
      const [existing] = await db
        .select()
        .from(idempotencyRecords)
        .where(and(eq(idempotencyRecords.key, key), eq(idempotencyRecords.userId, userId)))
        .limit(1);

      if (existing && Date.now() - existing.createdAt.getTime() < TTL_MS) {
        res.status(existing.statusCode).json(JSON.parse(existing.responseBody));
        return;
      }

      // Wrap res.json to capture + store the eventual response.
      const originalJson = res.json.bind(res);
      (res as any).json = (body: unknown) => {
        db.insert(idempotencyRecords)
          .values({
            key,
            userId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseBody: JSON.stringify(body),
          })
          .onConflictDoNothing()
          .catch((err) => console.error("idempotency store failed", err));
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Call periodically (e.g. from a cron) to keep the table from growing unbounded. */
export async function pruneExpiredIdempotencyRecords() {
  await db.delete(idempotencyRecords).where(lt(idempotencyRecords.createdAt, new Date(Date.now() - TTL_MS)));
}
