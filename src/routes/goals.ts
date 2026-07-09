import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { goals, milestones, tasks, activityEntries } from "../db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { notFound, forbidden } from "../lib/errors";
import { advanceGoal, updateStreak, currentStreakDisplay } from "../lib/progress";
import { broadcastInvalidate } from "../ws/hub";
import { ai } from "../services/ai";

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

async function serializeGoal(goalId: string) {
  const [goal] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!goal) return null;

  const goalMilestones = await db.select().from(milestones).where(eq(milestones.goalId, goalId)).orderBy(asc(milestones.position));

  const milestonesWithTasks = await Promise.all(
    goalMilestones.map(async (m) => {
      const mTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, m.id)).orderBy(asc(tasks.position));
      return {
        id: m.id,
        week: m.week,
        title: m.title,
        status: m.status,
        tasks: mTasks.map((t) => ({
          id: t.id,
          title: t.title,
          estimateMinutes: t.estimateMinutes,
          difficulty: t.difficulty,
          done: t.done,
        })),
      };
    })
  );

  return {
    id: goal.id,
    title: goal.title,
    archived: goal.archived,
    completed: goal.completed,
    completedAt: goal.completedAt?.toISOString() ?? null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
    roadmap: { milestones: milestonesWithTasks },
  };
}

async function assertOwnedGoal(userId: string, goalId: string) {
  const [goal] = await db.select({ id: goals.id, userId: goals.userId }).from(goals).where(eq(goals.id, goalId)).limit(1);
  if (!goal) throw notFound("goal");
  if (goal.userId !== userId) throw forbidden();
  return goal;
}

goalsRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const includeArchived = req.query.includeArchived === "true";
    const rows = await db
      .select()
      .from(goals)
      .where(includeArchived ? eq(goals.userId, userId) : and(eq(goals.userId, userId), eq(goals.archived, false)));
    const full = await Promise.all(rows.map((g) => serializeGoal(g.id)));
    res.json(full.filter(Boolean));
  } catch (err) {
    next(err);
  }
});

const roadmapTaskSchema = z.object({
  title: z.string().min(1),
  estimateMinutes: z.number().int().positive(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});
const roadmapMilestoneSchema = z.object({
  week: z.number().int(),
  title: z.string().min(1),
  status: z.enum(["done", "current", "upcoming"]).optional(),
  tasks: z.array(roadmapTaskSchema).min(1),
});
const createGoalSchema = z.object({
  title: z.string().min(1),
  roadmap: z.object({ milestones: z.array(roadmapMilestoneSchema).min(1) }),
});

goalsRouter.post("/", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = createGoalSchema.parse(req.body);

    const [goal] = await db.insert(goals).values({ userId, title: body.title }).returning();

    for (const [mi, m] of body.roadmap.milestones.entries()) {
      const [milestone] = await db
        .insert(milestones)
        .values({
          goalId: goal.id,
          week: m.week,
          title: m.title,
          status: m.status ?? (mi === 0 ? "current" : "upcoming"),
          position: mi,
        })
        .returning();

      for (const [ti, t] of m.tasks.entries()) {
        await db.insert(tasks).values({
          milestoneId: milestone.id,
          title: t.title,
          estimateMinutes: t.estimateMinutes,
          difficulty: t.difficulty,
          position: ti,
        });
      }
    }

    res.status(201).json(await serializeGoal(goal.id));
  } catch (err) {
    next(err);
  }
});

goalsRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGoal(userId, req.params.id);
    res.json(await serializeGoal(req.params.id));
  } catch (err) {
    next(err);
  }
});

goalsRouter.patch("/:id", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGoal(userId, req.params.id);
    const body = z.object({ archived: z.boolean().optional() }).parse(req.body);
    await db.update(goals).set({ ...body, updatedAt: new Date() }).where(eq(goals.id, req.params.id));
    res.json(await serializeGoal(req.params.id));
  } catch (err) {
    next(err);
  }
});

goalsRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGoal(userId, req.params.id);
    await db.delete(goals).where(eq(goals.id, req.params.id)); // cascades to milestones/tasks
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

goalsRouter.get("/:id/roadmap", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGoal(userId, req.params.id);
    const full = await serializeGoal(req.params.id);
    res.json(full!.roadmap);
  } catch (err) {
    next(err);
  }
});

const progressSchema = z.object({
  taskTitle: z.string(),
  rawText: z.string(),
  aiSummary: z.string().optional(),
  focusMinutes: z.number().int().nonnegative(),
  source: z.enum(["focus_session", "planner_chat"]),
});

goalsRouter.post("/:id/progress", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGoal(userId, req.params.id);
    const body = progressSchema.parse(req.body);

    // §8: if rawText is present and no aiSummary was supplied, the server
    // generates a short first-person summary via the AI service. Falls back
    // to plain truncation on its own if both providers are down (see
    // capabilities/summarize.ts) — never blocks logging progress.
    const aiSummary = body.aiSummary?.trim() || (await ai.summarize.summarizeProgress(body.rawText, body.taskTitle));

    await db.insert(activityEntries).values({
      userId,
      goalId: req.params.id,
      taskTitle: body.taskTitle,
      rawText: body.rawText,
      aiSummary,
      focusMinutes: body.focusMinutes,
      source: body.source,
    });

    const advance = await advanceGoal(req.params.id);
    const streak = await updateStreak(userId);

    const goal = await serializeGoal(req.params.id);
    broadcastInvalidate(userId, "goal", req.params.id, goal!.updatedAt);

    res.json({
      goal,
      milestoneAdvanced: advance.milestoneAdvanced,
      goalCompleted: advance.goalCompleted,
      streak,
    });
  } catch (err) {
    next(err);
  }
});

export { serializeGoal, assertOwnedGoal };
