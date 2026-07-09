import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/client";
import { users, userSettings, streaks, oauthConnections, pushTokens } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, getUserId } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { currentStreakDisplay } from "../lib/progress";
import { unauthorized, notFound } from "../lib/errors";

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw notFound("user");
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    const [streak] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      settings: settings
        ? {
            aiSuggestions: settings.aiSuggestions,
            emailReminders: settings.emailReminders,
            backgroundGlow: settings.backgroundGlow,
            theme: settings.theme,
            updatedAt: settings.updatedAt.toISOString(),
          }
        : null,
      streak: streak
        ? {
            count: currentStreakDisplay(streak.streakCount, streak.lastCompletionDay),
            longest: streak.longestStreak,
            lastCompletionDay: streak.lastCompletionDay,
          }
        : { count: 0, longest: 0, lastCompletionDay: null },
    });
  } catch (err) {
    next(err);
  }
});

meRouter.patch("/", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = z.object({ name: z.string().min(1).optional() }).parse(req.body);
    const [user] = await db.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

meRouter.delete("/", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { password } = z.object({ password: z.string().optional(), otp: z.string().optional() }).parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw notFound("user");
    if (user.passwordHash) {
      if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
        throw unauthorized("Re-authentication required: provide the correct password to delete your account.");
      }
    }
    await db.delete(users).where(eq(users.id, userId)); // cascades to all owned rows
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

meRouter.get("/settings", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (!settings) throw notFound("settings");
    res.json({
      aiSuggestions: settings.aiSuggestions,
      emailReminders: settings.emailReminders,
      backgroundGlow: settings.backgroundGlow,
      theme: settings.theme,
      updatedAt: settings.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

const settingsSchema = z.object({
  aiSuggestions: z.boolean().optional(),
  emailReminders: z.boolean().optional(),
  backgroundGlow: z.boolean().optional(),
  theme: z.enum(["dark", "light"]).optional(),
});

meRouter.patch("/settings", idempotency(), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = settingsSchema.parse(req.body);
    const [settings] = await db
      .update(userSettings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();
    res.json({
      aiSuggestions: settings.aiSuggestions,
      emailReminders: settings.emailReminders,
      backgroundGlow: settings.backgroundGlow,
      theme: settings.theme,
      updatedAt: settings.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

meRouter.post("/export", async (req, res, next) => {
  try {
    // Stub: kick off an async export job. Wire up to a queue (BullMQ, etc.)
    // + object storage + an email provider for the real implementation;
    // deliberately not built here since none of those are configured (§13).
    res.status(202).json({ status: "queued" });
  } catch (err) {
    next(err);
  }
});

meRouter.get("/connections", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const rows = await db.select({ provider: oauthConnections.provider }).from(oauthConnections).where(eq(oauthConnections.userId, userId));
    const connected = new Set(rows.map((r) => r.provider));
    res.json({ github: connected.has("github"), google: connected.has("google"), figma: connected.has("figma") });
  } catch (err) {
    next(err);
  }
});

meRouter.delete("/connections/:provider", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await db
      .delete(oauthConnections)
      .where(and(eq(oauthConnections.userId, userId), eq(oauthConnections.provider, req.params.provider)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const pushTokenSchema = z.object({
  platform: z.enum(["web", "ios", "android"]),
  token: z.string().min(1),
});

meRouter.post("/push-tokens", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = pushTokenSchema.parse(req.body);
    const [row] = await db
      .insert(pushTokens)
      .values({ userId, platform: body.platform, token: body.token })
      .onConflictDoNothing()
      .returning();
    if (row) {
      res.status(201).json({ id: row.id });
      return;
    }
    const [existing] = await db
      .select({ id: pushTokens.id })
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, body.token)))
      .limit(1);
    res.status(201).json({ id: existing?.id });
  } catch (err) {
    next(err);
  }
});

meRouter.delete("/push-tokens/:id", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await db.delete(pushTokens).where(and(eq(pushTokens.userId, userId), eq(pushTokens.id, req.params.id)));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

