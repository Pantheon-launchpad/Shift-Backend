import { aiRouter } from "../router";
import type { ToolDefinition } from "../types";

export interface ReasonInput {
  system: string;
  prompt: string;
  /** Tools the model may call. Omit `forceTool` to let it choose text vs. a tool call. */
  tools?: ToolDefinition[];
  /** Name of a tool from `tools` the model MUST call (e.g. structured-output extraction). */
  forceTool?: string;
  maxTokens?: number;
}

export interface ReasonOutput {
  text: string | null;
  toolCall: { name: string; input: Record<string, unknown> } | null;
}

/**
 * Single-shot reasoning over a prompt — the building block underneath
 * capabilities that need the model to think through something and either
 * answer in free text or return structured output via a tool call.
 * `forceTool` is for structured-extraction use cases (planner.generateRoadmap,
 * content.generatePost); omit it when the tool should be optional, like
 * planner chat's mark_task_done, where free text is a perfectly valid reply.
 */
export async function reason(input: ReasonInput): Promise<ReasonOutput> {
  const result = await aiRouter.complete({
    system: input.system,
    messages: [{ role: "user", content: input.prompt }],
    tools: input.tools,
    forceTool: input.forceTool,
    maxTokens: input.maxTokens,
  });
  return { text: result.text, toolCall: result.toolCall };
}
