import { aiRouter } from "../router";
import type { ChatMessage, ToolDefinition } from "../types";

export interface ChatInput {
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  forceTool?: string;
  maxTokens?: number;
}

export interface ChatOutput {
  text: string | null;
  toolCall: { name: string; input: Record<string, unknown> } | null;
  provider: "nvidia" | "anthropic";
}

/**
 * General-purpose conversational reply. This is the capability every other
 * chat-shaped feature (planner chat today; support chat, onboarding chat,
 * etc. tomorrow) should build on rather than calling the router directly,
 * so request/response shaping stays in one place.
 */
export async function reply(input: ChatInput): Promise<ChatOutput> {
  const result = await aiRouter.complete({
    system: input.system,
    messages: input.messages,
    tools: input.tools,
    forceTool: input.forceTool,
    maxTokens: input.maxTokens,
  });
  return result;
}
