import { AICapabilityNotImplementedError } from "../types";

export interface EmbedInput {
  texts: string[];
}
export interface EmbedOutput {
  vectors: number[][];
}

/**
 * Placeholder — no embeddings provider configured yet. Likely future use:
 * semantic search over a user's activity log / planner chat history.
 */
export async function embed(_input: EmbedInput): Promise<EmbedOutput> {
  throw new AICapabilityNotImplementedError("embeddings.embed");
}
