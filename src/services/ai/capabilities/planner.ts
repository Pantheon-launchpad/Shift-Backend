// Roadmap generation and planner chat replies. Both have a deterministic
// fallback (ported from the frontend's generateRoadmap.ts / plannerEngine.ts)
// so a total AI outage — NVIDIA *and* Anthropic both down — never blocks
// goal creation or chat; it just degrades to the template engine instead of
// erroring. Router-level NVIDIA→Anthropic fallback happens transparently
// beneath this; this file only needs to handle "both providers are down."

import { logger } from "../../../lib/logger";
import { reason } from "./reasoning";
import type { ToolDefinition } from "../types";
import {
  generateRoadmapDeterministic,
  type GeneratedRoadmap,
} from "../../../lib/generateRoadmap";
import {
  plannerReplyDeterministic,
  type PlannerContext,
  type PlannerReply,
} from "../../../lib/plannerEngine";

const ROADMAP_TOOL: ToolDefinition = {
  name: "submit_roadmap",
  description: "Submit a structured roadmap of milestones and tasks for the user's goal.",
  inputSchema: {
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

export async function generateRoadmap(goalTitle: string, answers: string[]): Promise<GeneratedRoadmap> {
  try {
    const result = await reason({
      system:
        "You turn a user's goal into a concrete, motivating roadmap of 3-5 milestones, each with 1-4 small, finishable tasks. Task time estimates should roughly respect the user's stated daily time budget. Call submit_roadmap with the result — do not reply in free text.",
      prompt: `Goal: ${goalTitle}\n\nIntake answers (in order — what done looks like, time per day, existing work, deadline):\n${answers.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
      tools: [ROADMAP_TOOL],
      forceTool: ROADMAP_TOOL.name,
      maxTokens: 2000,
    });

    if (!result.toolCall) throw new Error("Model didn't return a submit_roadmap tool call.");
    const raw = result.toolCall.input as { milestones: any[] };

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
    logger.warn("[AI] generateRoadmap: both providers failed, using deterministic fallback.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return generateRoadmapDeterministic(goalTitle, answers);
  }
}

const MARK_TASK_DONE_TOOL: ToolDefinition = {
  name: "mark_task_done",
  description: "Offer to mark the user's current task as done, when their message indicates they finished it.",
  inputSchema: {
    type: "object",
    required: ["taskId"],
    properties: { taskId: { type: "string" } },
  },
};

export async function plannerChatReply(
  message: string,
  ctx: PlannerContext,
  recentMessages: { from: "ai" | "user"; text: string }[]
): Promise<PlannerReply> {
  try {
    const roadmapSummary = ctx.milestones
      .map((m) => `- [${m.status}] ${m.title}: ${m.tasks.map((t) => `${t.done ? "x" : " "} ${t.title}`).join("; ")}`)
      .join("\n");

    const result = await reason({
      system: `You are the AI Planner for the goal "${ctx.goalTitle}" (${ctx.goalCompleted ? "completed" : "in progress"}). Current streak: ${ctx.streak} day(s). Today's task: ${ctx.todayTask?.title ?? "none"}.\n\nRoadmap:\n${roadmapSummary}\n\nBe concise and encouraging. If the user's message indicates they finished today's task, call mark_task_done with its id instead of just saying so in text.\n\nRecent conversation:\n${recentMessages.slice(-20).map((m) => `${m.from}: ${m.text}`).join("\n")}`,
      prompt: message,
      tools: ctx.todayTask ? [MARK_TASK_DONE_TOOL] : undefined,
      maxTokens: 500,
    });

    return {
      text: result.text ?? "Got it.",
      offerCompleteTaskId: result.toolCall?.name === "mark_task_done" ? (result.toolCall.input.taskId as string) : undefined,
    };
  } catch (err) {
    logger.warn("[AI] plannerChatReply: both providers failed, using deterministic fallback.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return plannerReplyDeterministic(message, ctx);
  }
}
