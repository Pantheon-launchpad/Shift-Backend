import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { goals, milestones, tasks, activityEntries, notifications } from "../db/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { since } = z.object({ since: z.string().datetime() }).parse(req.query);
    const sinceDate = new Date(since);

    const changedGoals = await db.select().from(goals).where(and(eq(goals.userId, userId), gt(goals.updatedAt, sinceDate)));
    const fullGoals = await Promise.all(
      changedGoals.map(async (g) => {
        const goalMilestones = await db.select().from(milestones).where(eq(milestones.goalId, g.id)).orderBy(asc(milestones.position));
        const milestonesWithTasks = await Promise.all(
          goalMilestones.map(async (m) => {
            const mTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, m.id)).orderBy(asc(tasks.position));
            return {
              id: m.id,
              week: m.week,
              title: m.title,
              status: m.status,
              tasks: mTasks.map((t) => ({ id: t.id, title: t.title, estimateMinutes: t.estimateMinutes, difficulty: t.difficulty, done: t.done })),
            };
          })
        );
        return {
          id: g.id,
          title: g.title,
          archived: g.archived,
          completed: g.completed,
          completedAt: g.completedAt?.toISOString() ?? null,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
          roadmap: { milestones: milestonesWithTasks },
        };
      })
    );

    const changedActivity = await db
      .select()
      .from(activityEntries)
      .where(and(eq(activityEntries.userId, userId), gt(activityEntries.createdAt, sinceDate)));

    const changedNotifications = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), gt(notifications.createdAt, sinceDate)));

    res.json({
      goals: fullGoals,
      activity: changedActivity.map((e) => ({
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
      notifications: changedNotifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});
