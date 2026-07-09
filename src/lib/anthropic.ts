// Server-side-only AI integration (§8). No Anthropic API key is ever sent
// to a client, web or mobile — every call happens here.
//
// Both entry points below have a deterministic fallback (generateRoadmap.ts /
// plannerEngine.ts) so a model outage never blocks the core loop, per §8's
// "users should never see 'AI is down' block goal creation" requirement.

import type { GeneratedRoadmap } from "./generateRoadmap";
import { generateRoadmapDeterministic } from "./generateRoadmap";
import { plannerReplyDeterministic, type PlannerContext, type PlannerReply } from "./plannerEngine";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

function apiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}

const ROADMAP_TOOL = {
  name: "submit_roadmap",
  description: "Submit a structured roadmap of milestones and tasks for the user's goal.",
  input_schema: {
    type: "object",
    required: ["milestones"],
    properties: {
      milestones: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          required: ["week", "title", "tasks"],
          properties: {
            week: { type: "integer" },
            title: { type: "string" },
            tasks: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: {
                type: "object",
                required: ["title", "estimateMinutes", "difficulty"],
                properties: {
                  title: { type: "string" },
                  estimateMinutes: { type: "integer" },
                  difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Calls Claude with tool use to get a structured roadmap rather than parsing
 * free text (§8). Falls back to the deterministic template generator if no
 * API key is configured, the call fails, or it times out.
 */
export async function generateRoadmapAI(goalTitle: string, answers: string[]): Promise<GeneratedRoadmap> {
  const key = apiKey();
  if (!key) return generateRoadmapDeterministic(goalTitle, answers);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system:
          "You turn a user's goal into a concrete, motivating roadmap of 3-5 milestones, each with 1-4 small, finishable tasks. Task time estimates should roughly respect the user's stated daily time budget. Call submit_roadmap with the result — do not reply in free text.",
        messages: [
          {
            role: "user",
            content: `Goal: ${goalTitle}\n\nIntake answers (in order — what done looks like, time per day, existing work, deadline):\n${answers.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
          },
        ],
        tools: [ROADMAP_TOOL],
        tool_choice: { type: "tool", name: "submit_roadmap" },
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as any;
    const toolUse = (data.content ?? []).find((b: any) => b.type === "tool_use" && b.name === "submit_roadmap");
    if (!toolUse) throw new Error("No tool_use block in response");

    const raw = toolUse.input as { milestones: any[] };
    return {
      milestones: raw.milestones.map((m, i) => ({
        week: m.week ?? i + 1,
        title: m.title,
        status: i === 0 ? "current" : "upcoming",
        tasks: m.tasks.map((t: any) => ({
          title: t.title,
          estimateMinutes: t.estimateMinutes,
          difficulty: t.difficulty,
        })),
      })),
    };
  } catch (err) {
    console.error("generateRoadmapAI failed, falling back to deterministic generator:", err);
    return generateRoadmapDeterministic(goalTitle, answers);
  }
}

const MARK_TASK_DONE_TOOL = {
  name: "mark_task_done",
  description: "Offer to mark the user's current task as done, when their message indicates they finished it.",
  input_schema: {
    type: "object",
    required: ["taskId"],
    properties: {
      taskId: { type: "string" },
    },
  },
};

/**
 * Calls Claude for a planner chat reply, giving it a mark_task_done tool
 * instead of parsing free text for completion intent (§8 — this is a strict
 * upgrade over the DONE_PATTERNS regex fallback, since the model can reason
 * about ambiguous phrasing like "finally got that working").
 */
export async function plannerReplyAI(
  message: string,
  ctx: PlannerContext,
  recentMessages: { from: "ai" | "user"; text: string }[]
): Promise<PlannerReply> {
  const key = apiKey();
  if (!key) return plannerReplyDeterministic(message, ctx);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const roadmapSummary = ctx.milestones
      .map((m) => `- [${m.status}] ${m.title}: ${m.tasks.map((t) => `${t.done ? "x" : " "} ${t.title}`).join("; ")}`)
      .join("\n");

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: `You are the AI Planner for the goal "${ctx.goalTitle}" (${ctx.goalCompleted ? "completed" : "in progress"}). Current streak: ${ctx.streak} day(s). Today's task: ${ctx.todayTask?.title ?? "none"}.\n\nRoadmap:\n${roadmapSummary}\n\nBe concise and encouraging. If the user's message indicates they finished today's task, call mark_task_done with its id instead of just saying so in text.`,
        messages: [
          ...recentMessages.slice(-20).map((m) => ({
            role: m.from === "ai" ? ("assistant" as const) : ("user" as const),
            content: m.text,
          })),
          { role: "user" as const, content: message },
        ],
        tools: ctx.todayTask ? [MARK_TASK_DONE_TOOL] : [],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as any;
    const blocks = data.content ?? [];
    const textBlock = blocks.find((b: any) => b.type === "text");
    const toolUse = blocks.find((b: any) => b.type === "tool_use" && b.name === "mark_task_done");

    return {
      text: textBlock?.text ?? "Got it.",
      offerCompleteTaskId: toolUse ? toolUse.input?.taskId : undefined,
    };
  } catch (err) {
    console.error("plannerReplyAI failed, falling back to deterministic engine:", err);
    return plannerReplyDeterministic(message, ctx);
  }
}
