// Provider-agnostic types for the AI service. Every capability and every
// provider speaks this shape — nothing outside src/services/ai/ should ever
// see an NVIDIA- or Anthropic-specific request/response format.

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A JSON-schema tool definition, translated per-provider in providers/*.ts. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface CompletionRequest {
  /** System prompt. Kept separate from `messages` since Anthropic takes it out-of-band. */
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Name of a tool the model must call, if any (vs. leaving it optional/auto). */
  forceTool?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ToolCallResult {
  name: string;
  input: Record<string, unknown>;
}

export interface CompletionResult {
  provider: "nvidia" | "anthropic";
  /** Free-text reply, if the model didn't call a tool. */
  text: string | null;
  /** Structured tool call, if the model called one (forced or auto). */
  toolCall: ToolCallResult | null;
}

/** Thrown when every configured provider has failed a given request. */
export class AIServiceError extends Error {
  causes: unknown[];
  constructor(message: string, causes: unknown[] = []) {
    super(message);
    this.name = "AIServiceError";
    this.causes = causes;
  }
}

/** Thrown by capability placeholders that don't have a provider yet (image, video, ...). */
export class AICapabilityNotImplementedError extends Error {
  constructor(capability: string) {
    super(`The "${capability}" capability doesn't have a provider wired up yet.`);
    this.name = "AICapabilityNotImplementedError";
  }
}
