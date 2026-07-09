import { Router } from "express";
import { db } from "../db/client";
import { activityEntries } from "../db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";

export const activityRouter = Router();
activityRouter.use(requireAuth);

// Opaque cursor = base64 of the createdAt ISO string of the last item
// returned, per §3's cursor-based pagination convention.
function encodeCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString()).toString("base64url");
}
function decodeCursor(cursor: string): Date {
  return new Date(Buffer.from(cursor, "base64url").toString("utf8"));
}

activityRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const goalId = typeof req.query.goalId === "string" ? req.query.goalId : undefined;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cursor = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;

    const conditions = [eq(activityEntries.userId, userId)];
    if (goalId) conditions.push(eq(activityEntries.goalId, goalId));
    if (cursor) conditions.push(lt(activityEntries.createdAt, cursor));

    const rows = await db
      .select()
      .from(activityEntries)
      .where(and(...conditions))
      .orderBy(desc(activityEntries.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      items: page.map((e) => ({
        id: e.id,
        goalId: e.goalId,
        taskTitle: e.taskTitle,
        rawText: e.rawText,
        aiSummary: e.aiSummary,
        link: e.link ?? undefined,
        focusMinutes: e.focusMinutes,
        source: e.source,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].createdAt) : null,
    });
  } catch (err) {
    next(err);
  }
});
