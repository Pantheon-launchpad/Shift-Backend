import { logger } from "../../../lib/logger";
import { reason } from "./reasoning";

/**
 * Turns a raw progress note into the short first-person summary shown in
 * the activity log and fed into Build in Public content generation.
 * Falls back to a plain truncation if both AI providers are down — never
 * blocks the progress-logging flow on an AI outage.
 */
export async function summarizeProgress(rawText: string, taskTitle: string): Promise<string> {
  const trimmed = rawText.trim();
  if (!trimmed) return taskTitle;
  if (trimmed.length <= 120) return trimmed; // already short enough, don't bother calling the model

  try {
    const result = await reason({
      system: "Summarize the user's progress note into one concise, first-person sentence (under 30 words). Keep specific details (what they actually did), don't editorialize.",
      prompt: `Task: ${taskTitle}\n\nNote: ${trimmed}`,
      maxTokens: 100,
    });
    return (result.text ?? "").trim() || trimmed.slice(0, 240);
  } catch (err) {
    logger.warn("[AI] summarize.summarizeProgress: both providers failed, using truncation fallback.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return trimmed.slice(0, 240);
  }
}
