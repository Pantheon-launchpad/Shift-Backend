import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { activityEntries, buildInPublicPosts, generatedPosts, goals, milestones } from "../db/schema";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { notFound, forbidden, badRequest } from "../lib/errors";
import { renderCardPng } from "../lib/renderCard";
import { uploadPng } from "../lib/storage";
import { ai } from "../services/ai";
import type { ActivityContext, ContentType, Platform } from "../services/ai/capabilities/content";

export const buildInPublicRouter = Router();
buildInPublicRouter.use(requireAuth);

function serialize(row: typeof buildInPublicPosts.$inferSelect) {
  return {
    id: row.id,
    goalId: row.goalId,
    twitterText: row.twitterText,
    linkedinText: row.linkedinText,
    cardHeadline: row.cardHeadline,
    cardSubline: row.cardSubline,
    cardImageUrl: row.cardImageUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

function encodeCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString()).toString("base64url");
}
function decodeCursor(cursor: string): Date {
  return new Date(Buffer.from(cursor, "base64url").toString("utf8"));
}

/** Progress % + current milestone title, computed inline rather than importing routes/goals.ts's heavier serializeGoal. */
async function getGoalProgressSummary(goalId: string): Promise<{ progressPercent: number; currentMilestoneTitle: string | null }> {
  const rows = await db
    .select({ id: milestones.id, title: milestones.title, status: milestones.status })
    .from(milestones)
    .where(eq(milestones.goalId, goalId));
  if (rows.length === 0) return { progressPercent: 0, currentMilestoneTitle: null };
  const done = rows.filter((m) => m.status === "done").length;
  const current = rows.find((m) => m.status === "current");
  return { progressPercent: Math.round((done / rows.length) * 100), currentMilestoneTitle: current?.title ?? null };
}

// Drafts the post text and card copy from an activity entry using the AI
// content capability (services/ai/capabilities/content.ts), then renders
// the card image synchronously (fast enough locally that a real job queue
// isn't needed for the hackathon MVP — see the README for how to swap this
// for a BullMQ job if render time becomes a bottleneck).
async function draftFromActivity(entry: typeof activityEntries.$inferSelect, goalTitle: string, goalId: string) {
  const headline = entry.taskTitle.length > 60 ? `${entry.taskTitle.slice(0, 57)}...` : entry.taskTitle;
  const subline = `Progress on ${goalTitle}`;

  const progress = await getGoalProgressSummary(goalId);
  const activity: ActivityContext[] = [
    { taskTitle: entry.taskTitle, summary: entry.aiSummary, focusMinutes: entry.focusMinutes, createdAt: entry.createdAt.toISOString() },
  ];
  const goalCtx = { title: goalTitle, ...progress };

  const [twitter, linkedin] = await Promise.all([
    ai.content.generatePost({ platform: "twitter", contentType: "short_post", goal: goalCtx, activity }),
    ai.content.generatePost({ platform: "linkedin", contentType: "short_post", goal: goalCtx, activity }),
  ]);

  return {
    headline,
    subline,
    twitterText: twitter.segments[0] ?? `Progress on "${goalTitle}": ${entry.aiSummary}`,
    linkedinText: linkedin.segments[0] ?? `Update on ${goalTitle}: ${entry.aiSummary}`,
  };
}

buildInPublicRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cursor = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;

    const conditions = [eq(buildInPublicPosts.userId, userId)];
    if (cursor) conditions.push(lt(buildInPublicPosts.createdAt, cursor));

    const rows = await db
      .select()
      .from(buildInPublicPosts)
      .where(and(...conditions))
      .orderBy(desc(buildInPublicPosts.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      items: page.map(serialize),
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].createdAt) : null,
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  goalId: z.string().uuid(),
  activityEntryId: z.string().uuid(),
});

buildInPublicRouter.post("/", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = createSchema.parse(req.body);

    const [goal] = await db.select().from(goals).where(eq(goals.id, body.goalId)).limit(1);
    if (!goal) throw notFound("goal");
    if (goal.userId !== userId) throw forbidden();

    const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, body.activityEntryId)).limit(1);
    if (!entry) throw notFound("activity entry");
    if (entry.userId !== userId) throw forbidden();

    const draft = await draftFromActivity(entry, goal.title, goal.id);
    const png = renderCardPng({ headline: draft.headline, subline: draft.subline });
    const cardImageUrl = await uploadPng(png);

    const [row] = await db
      .insert(buildInPublicPosts)
      .values({
        userId,
        goalId: body.goalId,
        twitterText: draft.twitterText,
        linkedinText: draft.linkedinText,
        cardHeadline: draft.headline,
        cardSubline: draft.subline,
        cardImageUrl,
      })
      .returning();

    res.status(201).json(serialize(row));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Multi-platform / multi-format content generation. Separate from the
// activity-card flow above — this covers threads, founder updates, weekly
// summaries, milestone announcements, long-form articles, and technical
// blog posts, across Twitter/LinkedIn/Medium/Dev.to/personal blog. See
// services/ai/capabilities/content.ts for how platform+format map to
// prompt guidance.
// ---------------------------------------------------------------------------

const PLATFORMS: Platform[] = ["twitter", "linkedin", "medium", "devto", "blog"];
const CONTENT_TYPES: ContentType[] = [
  "short_post",
  "thread",
  "founder_update",
  "weekly_summary",
  "milestone_announcement",
  "long_form_article",
  "technical_blog_post",
];

function serializeGenerated(row: typeof generatedPosts.$inferSelect) {
  return {
    id: row.id,
    goalId: row.goalId,
    platform: row.platform,
    contentType: row.contentType,
    title: row.title,
    segments: JSON.parse(row.segments) as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const generateSchema = z.object({
  goalId: z.string().uuid(),
  platform: z.enum(PLATFORMS as [Platform, ...Platform[]]),
  contentType: z.enum(CONTENT_TYPES as [ContentType, ...ContentType[]]),
  /** Ties the post to one specific update (short_post/thread/milestone_announcement). */
  activityEntryId: z.string().uuid().optional(),
  /** Milestone this is announcing — defaults to the goal's most recently completed one. */
  milestoneId: z.string().uuid().optional(),
  /** How far back to pull activity for weekly_summary/founder_update/long-form formats. */
  timeframeDays: z.number().int().positive().max(90).optional(),
  tone: z.string().max(60).optional(),
});

buildInPublicRouter.post("/generate", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = generateSchema.parse(req.body);

    const [goal] = await db.select().from(goals).where(eq(goals.id, body.goalId)).limit(1);
    if (!goal) throw notFound("goal");
    if (goal.userId !== userId) throw forbidden();

    const progress = await getGoalProgressSummary(body.goalId);

    // Gather the activity context: one specific entry if given, otherwise
    // everything in the requested (or default 7-day) timeframe.
    let activityRows: (typeof activityEntries.$inferSelect)[];
    if (body.activityEntryId) {
      const [entry] = await db.select().from(activityEntries).where(eq(activityEntries.id, body.activityEntryId)).limit(1);
      if (!entry) throw notFound("activity entry");
      if (entry.userId !== userId) throw forbidden();
      activityRows = [entry];
    } else {
      const days = body.timeframeDays ?? 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      activityRows = await db
        .select()
        .from(activityEntries)
        .where(and(eq(activityEntries.goalId, body.goalId), gte(activityEntries.createdAt, since)))
        .orderBy(asc(activityEntries.createdAt));
    }

    let completedMilestoneTitle: string | undefined;
    if (body.contentType === "milestone_announcement") {
      if (body.milestoneId) {
        const [m] = await db.select().from(milestones).where(eq(milestones.id, body.milestoneId)).limit(1);
        if (!m || m.goalId !== body.goalId) throw badRequest("MILESTONE_NOT_FOUND", "That milestone doesn't belong to this goal.");
        completedMilestoneTitle = m.title;
      } else {
        const [mostRecentDone] = await db
          .select()
          .from(milestones)
          .where(and(eq(milestones.goalId, body.goalId), eq(milestones.status, "done")))
          .orderBy(desc(milestones.updatedAt))
          .limit(1);
        completedMilestoneTitle = mostRecentDone?.title;
      }
    }

    const activity: ActivityContext[] = activityRows.map((e) => ({
      taskTitle: e.taskTitle,
      summary: e.aiSummary,
      focusMinutes: e.focusMinutes,
      createdAt: e.createdAt.toISOString(),
    }));

    const generated = await ai.content.generatePost({
      platform: body.platform,
      contentType: body.contentType,
      goal: { title: goal.title, ...progress },
      activity,
      completedMilestoneTitle,
      tone: body.tone,
    });

    const [row] = await db
      .insert(generatedPosts)
      .values({
        userId,
        goalId: body.goalId,
        platform: body.platform,
        contentType: body.contentType,
        title: generated.title,
        segments: JSON.stringify(generated.segments),
      })
      .returning();

    res.status(201).json(serializeGenerated(row));
  } catch (err) {
    next(err);
  }
});

function encodeGeneratedCursor(createdAt: Date): string {
  return Buffer.from(createdAt.toISOString()).toString("base64url");
}

buildInPublicRouter.get("/generated", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cursor = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;

    const conditions = [eq(generatedPosts.userId, userId)];
    if (typeof req.query.goalId === "string") conditions.push(eq(generatedPosts.goalId, req.query.goalId));
    if (typeof req.query.platform === "string") conditions.push(eq(generatedPosts.platform, req.query.platform));
    if (cursor) conditions.push(lt(generatedPosts.createdAt, cursor));

    const rows = await db
      .select()
      .from(generatedPosts)
      .where(and(...conditions))
      .orderBy(desc(generatedPosts.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    res.json({
      items: page.map(serializeGenerated),
      nextCursor: hasMore ? encodeGeneratedCursor(page[page.length - 1].createdAt) : null,
    });
  } catch (err) {
    next(err);
  }
});

async function assertOwnedGenerated(userId: string, id: string) {
  const [row] = await db.select().from(generatedPosts).where(eq(generatedPosts.id, id)).limit(1);
  if (!row) throw notFound("generated post");
  if (row.userId !== userId) throw forbidden();
  return row;
}

buildInPublicRouter.get("/generated/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const row = await assertOwnedGenerated(userId, req.params.id);
    res.json(serializeGenerated(row));
  } catch (err) {
    next(err);
  }
});

const patchGeneratedSchema = z.object({
  title: z.string().nullable().optional(),
  segments: z.array(z.string()).min(1).optional(),
});

// Fully editable, per the spec — the model's output is a starting point, not the final word.
buildInPublicRouter.patch("/generated/:id", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGenerated(userId, req.params.id);
    const body = patchGeneratedSchema.parse(req.body);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) update.title = body.title;
    if (body.segments !== undefined) update.segments = JSON.stringify(body.segments);

    const [row] = await db.update(generatedPosts).set(update).where(eq(generatedPosts.id, req.params.id)).returning();
    res.json(serializeGenerated(row));
  } catch (err) {
    next(err);
  }
});

buildInPublicRouter.delete("/generated/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedGenerated(userId, req.params.id);
    await db.delete(generatedPosts).where(eq(generatedPosts.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

async function assertOwnedPost(userId: string, id: string) {
  const [row] = await db.select().from(buildInPublicPosts).where(eq(buildInPublicPosts.id, id)).limit(1);
  if (!row) throw notFound("post");
  if (row.userId !== userId) throw forbidden();
  return row;
}

buildInPublicRouter.get("/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const row = await assertOwnedPost(userId, req.params.id);
    res.json(serialize(row));
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  twitterText: z.string().optional(),
  linkedinText: z.string().optional(),
});

buildInPublicRouter.patch("/:id", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await assertOwnedPost(userId, req.params.id);
    const body = patchSchema.parse(req.body);
    const [row] = await db.update(buildInPublicPosts).set(body).where(eq(buildInPublicPosts.id, req.params.id)).returning();
    res.json(serialize(row));
  } catch (err) {
    next(err);
  }
});

buildInPublicRouter.post("/:id/render", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const row = await assertOwnedPost(userId, req.params.id);

    const png = renderCardPng({ headline: row.cardHeadline, subline: row.cardSubline });
    const cardImageUrl = await uploadPng(png);
    await db.update(buildInPublicPosts).set({ cardImageUrl }).where(eq(buildInPublicPosts.id, row.id));

    // Rendering is synchronous here, but the spec's contract is "queued then
    // poll GET /:id for cardImageUrl", so we honor that response shape even
    // though it's already done by the time we reply.
    res.status(202).json({ status: "queued" });
  } catch (err) {
    next(err);
  }
});

