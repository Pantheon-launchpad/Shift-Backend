import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { goals, milestones, tasks, plannerMessages, streaks } from "../db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { nextIntakeQuestion } from "../lib/plannerEngine";
import { ai } from "../services/ai";
import { assertOwnedGoal } from "./goals";
import { currentStreakDisplay } from "../lib/progress";
import { notFound } from "../lib/errors";

export const plannerRouter = Router();
plannerRouter.use(requireAuth);

plannerRouter.post("/intake/next-question", async (req, res, next) => {
  try {
    const { previousAnswers } = z.object({ previousAnswers: z.array(z.string()) }).parse(req.body);
    const next_ = nextIntakeQuestion(previousAnswers);
    if (!next_) {
      res.json({ question: null, isLastQuestion: true });
      return;
    }
    res.json(next_);
  } catch (err) {
    next(err);
  }
});

const generateRoadmapSchema = z.object({
  goalTitle: z.string().min(1),
  answers: z.array(z.string()),
});

plannerRouter.post("/generate-roadmap", idempotency(), async (req, res, next) => {
  try {
    const body = generateRoadmapSchema.parse(req.body);
    const roadmap = await ai.planner.generateRoadmap(body.goalTitle, body.answers);
    res.json({ roadmap });
  } catch (err) {
    next(err);
  }
});

export const goalPlannerRouter = Router({ mergeParams: true });
goalPlannerRouter.use(requireAuth);

goalPlannerRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGoal(userId, (req.params as any).id);

    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const rows = await db
      .select()
      .from(plannerMessages)
      .where(eq(plannerMessages.goalId, (req.params as any).id))
      .orderBy(asc(plannerMessages.createdAt))
      .limit(limit);

    res.json({
      items: rows.map((m) => ({
        id: m.id,
        goalId: m.goalId,
        from: m.fromRole,
        text: m.text,
        actionTaskId: m.actionTaskId ?? undefined,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: null,
    });
  } catch (err) {
    next(err);
  }
});

const sendMessageSchema = z.object({ text: z.string().min(1) });

goalPlannerRouter.post("/", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const goalId = (req.params as any).id;
    await assertOwnedGoal(userId, goalId);
    const { text } = sendMessageSchema.parse(req.body);

    const [goal] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
    if (!goal) throw notFound("goal");

    const goalMilestones = await db.select().from(milestones).where(eq(milestones.goalId, goalId)).orderBy(asc(milestones.position));
    const milestonesWithTasks = await Promise.all(
      goalMilestones.map(async (m) => {
        const mTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, m.id)).orderBy(asc(tasks.position));
        return {
          id: m.id,
          title: m.title,
          status: m.status as "done" | "current" | "upcoming",
          tasks: mTasks.map((t) => ({ id: t.id, title: t.title, done: t.done })),
        };
      })
    );
    const currentMilestone = milestonesWithTasks.find((m) => m.status === "current") ?? null;
    const todayTask = currentMilestone?.tasks.find((t) => !t.done) ?? null;

    const [streak] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
    const streakDisplay = streak ? currentStreakDisplay(streak.streakCount, streak.lastCompletionDay) : 0;

    const history = await db
      .select()
      .from(plannerMessages)
      .where(eq(plannerMessages.goalId, goalId))
      .orderBy(asc(plannerMessages.createdAt));

    // Store the user's message first.
    await db.insert(plannerMessages).values({ goalId, fromRole: "user", text });

    const reply = await ai.planner.plannerChatReply(
      text,
      {
        goalTitle: goal.title,
        goalCompleted: goal.completed,
        milestones: milestonesWithTasks,
        currentMilestone,
        todayTask,
        streak: streakDisplay,
      },
      history.map((m) => ({ from: m.fromRole as "ai" | "user", text: m.text }))
    );

    const [aiMessage] = await db
      .insert(plannerMessages)
      .values({ goalId, fromRole: "ai", text: reply.text, actionTaskId: reply.offerCompleteTaskId ?? null })
      .returning();

    res.json({
      id: aiMessage.id,
      goalId: aiMessage.goalId,
      from: "ai",
      text: aiMessage.text,
      actionTaskId: aiMessage.actionTaskId ?? undefined,
      createdAt: aiMessage.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
