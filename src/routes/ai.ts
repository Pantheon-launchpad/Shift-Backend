// Public, unauthenticated quick-assist AI endpoints matching the frontend's
// src/lib/aiApi.ts contract exactly (paths, request bodies, response
// shapes). Deliberately NOT behind requireAuth or the DB — these back
// pre-goal / no-account moments (the "chat instead" intake, quick task
// suggestions, etc). For the authenticated, DB-backed AI features (real
// roadmap generation, persisted planner chat, build-in-public from real
// activity) see routes/planner.ts and routes/buildInPublic.ts, which share
// the same underlying services/ai/* provider fallback.

import { Router } from "express";
import { z } from "zod";
import {
  suggestTasks,
  planReply,
  draftBuildInPublicQuick,
  refreshRisks,
  collectStep,
  type CollectChatMessage,
} from "../services/ai/capabilities/quickAssist";

export const aiRouter = Router();

function generationFailed(res: import("express").Response, err: unknown, message: string) {
  console.error(err);
  res.status(502).json({ error: { code: "GENERATION_FAILED", message } });
}

// POST /v1/ai/tasks
const tasksSchema = z.object({
  goalTitle: z.string().min(1),
  milestoneTitle: z.string().optional(),
  todayTaskTitle: z.string().optional(),
  count: z.number().optional(),
});

aiRouter.post("/tasks", async (req, res) => {
  const parsed = tasksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "goalTitle is required" } });
    return;
  }
  try {
    const tasks = await suggestTasks(parsed.data);
    res.json({ tasks });
  } catch (err) {
    generationFailed(res, err, "Could not generate tasks right now");
  }
});

// POST /v1/ai/plan-reply
const planReplySchema = z.object({
  message: z.string().min(1),
  goalTitle: z.string().min(1),
  milestoneTitle: z.string().optional(),
  todayTaskTitle: z.string().optional(),
  streak: z.number().optional(),
  progressPct: z.number().optional(),
});

aiRouter.post("/plan-reply", async (req, res) => {
  const parsed = planReplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "message and goalTitle are required" } });
    return;
  }
  try {
    const text = await planReply(parsed.data);
    res.json({ text });
  } catch (err) {
    generationFailed(res, err, "Could not reach the AI service right now");
  }
});

// POST /v1/ai/build-in-public
const buildInPublicSchema = z.object({
  goalTitle: z.string().min(1),
  milestoneTitle: z.string().optional(),
  taskTitle: z.string().optional(),
  summary: z.string().optional(),
  roadmapMilestones: z.array(z.string()).optional(),
});

aiRouter.post("/build-in-public", async (req, res) => {
  const parsed = buildInPublicSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "goalTitle is required" } });
    return;
  }
  try {
    const posts = await draftBuildInPublicQuick(parsed.data);
    res.json(posts);
  } catch (err) {
    generationFailed(res, err, "Could not generate posts right now");
  }
});

// POST /v1/ai/risks
const risksSchema = z.object({
  goalTitle: z.string().min(1),
  category: z.string().optional(),
  timeline: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  resources: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  timePerDayMinutes: z.number().nullable().optional(),
  constraints: z.array(z.string()).optional(),
});

aiRouter.post("/risks", async (req, res) => {
  const parsed = risksSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "goalTitle is required" } });
    return;
  }
  try {
    const risks = await refreshRisks(parsed.data);
    res.json({ risks });
  } catch (err) {
    generationFailed(res, err, "Could not refresh risks right now");
  }
});

// POST /v1/ai/collect
const collectMessageSchema = z.object({ from: z.enum(["user", "ai"]), text: z.string() });
const collectSchema = z.object({
  messages: z.array(collectMessageSchema).min(1),
  collectedSoFar: z.record(z.string(), z.unknown()).optional(),
});

aiRouter.post("/collect", async (req, res) => {
  const parsed = collectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "messages is required" } });
    return;
  }
  try {
    const result = await collectStep(parsed.data.messages as CollectChatMessage[], parsed.data.collectedSoFar ?? {});
    res.json(result);
  } catch (err) {
    generationFailed(res, err, "Could not reach the AI service right now");
  }
});

aiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
