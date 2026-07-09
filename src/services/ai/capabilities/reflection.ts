import { logger } from "../../../lib/logger";
import { reason } from "./reasoning";

export interface ReflectionInput {
  goalTitle: string;
  completedMilestoneTitle: string;
  daysOnMilestone: number;
  streak: number;
}

/**
 * Generates a short retrospective when a milestone completes — "what this
 * milestone was, what it took, what's different now." Not wired to a route
 * yet; no product surface has been decided for it (a planner-chat message?
 * a notification? a Build in Public draft?). The capability exists now per
 * the architecture goal of giving every planned feature a place to live
 * before it's needed, so whichever surface gets picked later is a routing
 * decision, not new AI-integration work.
 */
export async function generateReflection(input: ReflectionInput): Promise<string> {
  try {
    const result = await reason({
      system: "Write a short, honest, first-person reflection (2-3 sentences) on completing a milestone. Not hype — genuine and specific.",
      prompt: `Goal: ${input.goalTitle}\nMilestone completed: ${input.completedMilestoneTitle}\nTime spent on it: ${input.daysOnMilestone} day(s)\nCurrent streak: ${input.streak} day(s)`,
      maxTokens: 150,
    });
    return (result.text ?? "").trim() || `Completed "${input.completedMilestoneTitle}" on ${input.goalTitle}.`;
  } catch (err) {
    logger.warn("[AI] reflection.generateReflection: both providers failed, using plain fallback.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return `Completed "${input.completedMilestoneTitle}" on ${input.goalTitle}.`;
  }
}
