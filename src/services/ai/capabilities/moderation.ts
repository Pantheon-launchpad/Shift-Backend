import { AICapabilityNotImplementedError } from "../types";

export interface ModerateInput {
  text: string;
}
export interface ModerateOutput {
  flagged: boolean;
  categories: string[];
}

/**
 * Placeholder — no moderation provider configured yet. Likely future use:
 * screening planner chat input, or Build in Public content before it's
 * queued for posting.
 */
export async function moderate(_input: ModerateInput): Promise<ModerateOutput> {
  throw new AICapabilityNotImplementedError("moderation.moderate");
}
