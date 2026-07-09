import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { notifications } from "../db/schema";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";
import { notFound, forbidden } from "../lib/errors";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

function encodeCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString()).toString("base64url");
}
function decodeCursor(cursor: string): Date {
  return new Date(Buffer.from(cursor, "base64url").toString("utf8"));
}

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cursor = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;

    const conditions = [eq(notifications.userId, userId)];
    if (cursor) conditions.push(lt(notifications.createdAt, cursor));

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      items: page.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].createdAt) : null,
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { read } = z.object({ read: z.boolean() }).parse(req.body);

    const [existing] = await db.select({ userId: notifications.userId }).from(notifications).where(eq(notifications.id, req.params.id)).limit(1);
    if (!existing) throw notFound("notification");
    if (existing.userId !== userId) throw forbidden();

    const [updated] = await db
      .update(notifications)
      .set({ readAt: read ? new Date() : null })
      .where(eq(notifications.id, req.params.id))
      .returning();

    res.json({
      id: updated.id,
      title: updated.title,
      body: updated.body,
      readAt: updated.readAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
