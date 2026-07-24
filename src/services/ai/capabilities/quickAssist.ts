// Lightweight, stateless AI helpers for pre-DB / unauthenticated moments in
// the app (goal intake chat, quick task suggestions, risk refresh, etc).
// These intentionally do NOT touch the database and do NOT require auth —
// see src/routes/ai.ts. They're built on the same reason() primitive as
// every other capability, so they inherit the NVIDIA -> Anthropic fallback
// for free instead of talking to a third LLM provider directly.

import { reason } from "./reasoning";
import type { ToolDefinition } from "../types";

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

// ---------------------------------------------------------------------------
// suggestTasks — small to-dos related to a goal, separate from the roadmap.
// ---------------------------------------------------------------------------
const SUGGEST_TASKS_TOOL: ToolDefinition = {
  name: "submit_tasks",
  description: "Submit a short list of small to-do suggestions.",
  inputSchema: {
    type: "object",
    required: ["tasks"],
    properties: {
      tasks: { type: "array", items: { type: "string" } },
    },
  },
};

export interface SuggestTasksInput {
  goalTitle: string;
  milestoneTitle?: string;
  todayTaskTitle?: string;
  count?: number;
}

export async function suggestTasks(input: SuggestTasksInput): Promise<string[]> {
  const count = input.count ?? 3;
  const prompt = `A user just set the goal "${input.goalTitle}" in a productivity app.
${input.milestoneTitle ? `Their current milestone is "${input.milestoneTitle}".` : ""}
${input.todayTaskTitle ? `Their next roadmap task is "${input.todayTaskTitle}".` : ""}

Suggest ${count} small, concrete to-do items that support this goal but are NOT the roadmap task above — quick wins, setup chores, or research they could knock out today (each under 8 words, action-first, no numbering, no punctuation at the end).`;

  const result = await reason({
    system: "You generate short, concrete to-do suggestions for a productivity app. Always respond by calling submit_tasks.",
    prompt,
    tools: [SUGGEST_TASKS_TOOL],
    forceTool: SUGGEST_TASKS_TOOL.name,
    maxTokens: 300,
  });

  const raw = (result.toolCall?.input as { tasks?: unknown } | undefined)?.tasks;
  return asStringArray(raw).slice(0, count);
}

// ---------------------------------------------------------------------------
// planReply — free-text reply for the ongoing "thinking log" chat, without
// the DB-backed history/milestone context the authenticated planner chat has.
// ---------------------------------------------------------------------------
export interface PlanReplyInput {
  message: string;
  goalTitle: string;
  milestoneTitle?: string;
  todayTaskTitle?: string;
  streak?: number;
  progressPct?: number;
}

export async function planReply(input: PlanReplyInput): Promise<string> {
  const system = `You are Plan, the AI planning assistant inside a productivity app called Shift. You help the user stay on track with one active goal. Be warm, direct, and brief — 2-4 sentences max, no headers or bullet lists unless truly helpful. Never invent progress numbers or tasks that weren't given to you.`;

  const prompt = `Goal: "${input.goalTitle}"
${input.milestoneTitle ? `Current milestone: "${input.milestoneTitle}"` : ""}
${input.todayTaskTitle ? `Today's roadmap task: "${input.todayTaskTitle}"` : "No roadmap task is currently active."}
${typeof input.progressPct === "number" ? `Overall progress: ${input.progressPct}%` : ""}
${typeof input.streak === "number" ? `Current streak: ${input.streak} day(s)` : ""}

The user just said: "${input.message}"

Reply to them directly, in character as Plan.`;

  const result = await reason({ system, prompt, maxTokens: 400 });
  return (result.text ?? "").trim();
}

// ---------------------------------------------------------------------------
// draftBuildInPublicQuick — all 4 platforms + card copy in one shot, from
// bare goal/task context rather than a stored activity entry. This is
// separate from services/ai/capabilities/content.ts (which the authenticated
// /v1/build-in-public route uses per-platform against real DB activity).
// ---------------------------------------------------------------------------
const DRAFT_BIP_TOOL: ToolDefinition = {
  name: "submit_posts",
  description: "Submit platform-native post drafts and progress-card copy.",
  inputSchema: {
    type: "object",
    required: ["twitter", "linkedin", "instagram", "medium", "cardHeadline", "cardSubline"],
    properties: {
      twitter: { type: "string" },
      linkedin: { type: "string" },
      instagram: { type: "string" },
      medium: { type: "string" },
      cardHeadline: { type: "string" },
      cardSubline: { type: "string" },
    },
  },
};

export interface DraftBuildInPublicInput {
  goalTitle: string;
  milestoneTitle?: string;
  taskTitle?: string;
  summary?: string;
  roadmapMilestones?: string[];
}

export interface DraftBuildInPublicOutput {
  twitter: string;
  linkedin: string;
  instagram: string;
  medium: string;
  cardHeadline: string;
  cardSubline: string;
}

export async function draftBuildInPublicQuick(input: DraftBuildInPublicInput): Promise<DraftBuildInPublicOutput> {
  const roadmapContext =
    Array.isArray(input.roadmapMilestones) && input.roadmapMilestones.length
      ? `Roadmap milestones: ${input.roadmapMilestones.join(", ")}.`
      : "";

  const prompt = `Someone is building in public and wants today's update turned into platform-native posts.

Goal: "${input.goalTitle}"
${input.milestoneTitle ? `Current milestone: "${input.milestoneTitle}"` : ""}
${input.taskTitle ? `Task just completed: "${input.taskTitle}"` : ""}
${input.summary ? `What they did: ${input.summary}` : ""}
${roadmapContext}

Write four versions of the same update, one per platform, in the platform's native voice:
- twitter: under 260 characters, punchy, 1-2 relevant hashtags max (include #buildinpublic), no more than one emoji
- linkedin: 2-4 sentences, reflective/professional tone, no hashtag spam (0-2 hashtags max)
- instagram: casual, upbeat, a couple of emoji are fine, 1-3 hashtags
- medium: a 2-3 sentence blog-post opening paragraph, first person, no hashtags, sets up a longer post without needing one

Also write cardHeadline (under 8 words) and cardSubline (under 10 words) for a shareable progress card.`;

  const result = await reason({
    system: "You draft platform-native build-in-public social posts. Always respond by calling submit_posts.",
    prompt,
    tools: [DRAFT_BIP_TOOL],
    forceTool: DRAFT_BIP_TOOL.name,
    maxTokens: 700,
  });

  const out = (result.toolCall?.input ?? {}) as Partial<DraftBuildInPublicOutput>;
  const required: (keyof DraftBuildInPublicOutput)[] = [
    "twitter",
    "linkedin",
    "instagram",
    "medium",
    "cardHeadline",
    "cardSubline",
  ];
  for (const key of required) {
    if (typeof out[key] !== "string" || !out[key]!.trim()) {
      throw new Error(`Model response missing "${key}"`);
    }
  }
  return out as DraftBuildInPublicOutput;
}

// ---------------------------------------------------------------------------
// refreshRisks — re-evaluate risks against everything known about the goal.
// ---------------------------------------------------------------------------
const REFRESH_RISKS_TOOL: ToolDefinition = {
  name: "submit_risks",
  description: "Submit a short list of specific, realistic risks.",
  inputSchema: {
    type: "object",
    required: ["risks"],
    properties: {
      risks: { type: "array", items: { type: "string" } },
    },
  },
};

export interface RefreshRisksInput {
  goalTitle: string;
  category?: string;
  timeline?: string | null;
  experience?: string | null;
  resources?: string | null;
  audience?: string | null;
  timePerDayMinutes?: number | null;
  constraints?: string[];
}

export async function refreshRisks(input: RefreshRisksInput): Promise<string[]> {
  const known = [
    input.category ? `Category: ${input.category}` : null,
    input.timeline ? `Timeline: ${input.timeline}` : null,
    input.experience ? `Experience: ${input.experience}` : null,
    input.resources ? `Resources: ${input.resources}` : null,
    input.audience ? `Who it's for: ${input.audience}` : null,
    input.timePerDayMinutes ? `Time available: ${input.timePerDayMinutes} minutes/day` : null,
    Array.isArray(input.constraints) && input.constraints.length ? `Constraints: ${input.constraints.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `Someone's goal: "${input.goalTitle}"
${known || "No further detail is known yet beyond the goal itself."}

Based on everything known above — not generic advice — list 2-4 realistic risks specific to THIS person's situation (their timeline, experience level, available time, and resources should all shape which risks matter most). Each risk under 15 words, concrete, not generic filler like "staying motivated."`;

  const result = await reason({
    system: "You identify specific, non-generic risks for someone's stated goal. Always respond by calling submit_risks.",
    prompt,
    tools: [REFRESH_RISKS_TOOL],
    forceTool: REFRESH_RISKS_TOOL.name,
    maxTokens: 300,
  });

  const raw = (result.toolCall?.input as { risks?: unknown } | undefined)?.risks;
  return asStringArray(raw).slice(0, 4);
}

// ---------------------------------------------------------------------------
// collectStep — one turn of the "chat instead" intake flow.
// ---------------------------------------------------------------------------
const COLLECT_FIELDS = ["goal", "motivation", "timeline", "experience", "resources", "audience", "timePerDayMinutes"];

const COLLECT_STEP_TOOL: ToolDefinition = {
  name: "submit_collect_step",
  description: "Submit the next reply, any newly-confident fields, risks, and completion state.",
  inputSchema: {
    type: "object",
    required: ["reply", "done"],
    properties: {
      reply: { type: "string" },
      fields: {
        type: "object",
        properties: Object.fromEntries(COLLECT_FIELDS.map((f) => [f, { type: f === "timePerDayMinutes" ? "number" : "string" }])),
      },
      risks: { type: "array", items: { type: "string" } },
      done: { type: "boolean" },
    },
  },
};

export interface CollectChatMessage {
  from: "user" | "ai";
  text: string;
}

export interface CollectStepResult {
  reply: string;
  fields: Record<string, string | number | null | undefined>;
  risks: string[];
  done: boolean;
}

export async function collectStep(
  messages: CollectChatMessage[],
  collectedSoFar: Record<string, unknown>
): Promise<CollectStepResult> {
  const transcript = messages.map((m) => `${m.from === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n");

  const knownSoFar = Object.entries(collectedSoFar ?? {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const system = `You are Plan's intake assistant inside a productivity app called Shift. Someone doesn't have a full write-up of their goal ready, so you're collecting it conversationally, one question at a time. Be warm and brief — 1-2 sentences, one question per turn. Never ask about a field you already have. Fields you're collecting: ${COLLECT_FIELDS.join(", ")}, plus a couple of realistic risks once you know enough to name specific ones. You have enough once you know at least "goal" and 3 other fields — don't drag it out past that. Always respond by calling submit_collect_step.`;

  const prompt = `Fields collected so far:
${knownSoFar || "(none yet)"}

Conversation so far:
${transcript}

Fill in "fields" with any of ${COLLECT_FIELDS.join(", ")} you can now confidently take from the LATEST user message (omit keys you don't have; timePerDayMinutes must be a number of minutes per day). Fill in "risks" with 0-3 short, specific risk strings if you now know enough to name real ones, else leave it empty. Set "done" to true once you have "goal" plus at least 3 other fields, or the user signals they're done/have nothing more to add.`;

  const result = await reason({
    system,
    prompt,
    tools: [COLLECT_STEP_TOOL],
    forceTool: COLLECT_STEP_TOOL.name,
    maxTokens: 400,
  });

  const out = (result.toolCall?.input ?? {}) as {
    reply?: unknown;
    fields?: unknown;
    risks?: unknown;
    done?: unknown;
  };

  if (typeof out.reply !== "string" || typeof out.done !== "boolean") {
    throw new Error("Malformed collect response");
  }

  return {
    reply: out.reply,
    fields: out.fields && typeof out.fields === "object" ? (out.fields as Record<string, string | number | null | undefined>) : {},
    risks: asStringArray(out.risks),
    done: out.done,
  };
}
