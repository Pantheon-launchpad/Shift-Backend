import type { CompletionRequest, CompletionResult } from "../types";

/**
 * Every text-generation provider (NVIDIA, Anthropic, and whatever's added
 * next) implements this. The router and every capability only ever talk to
 * this interface — no provider-specific types leak past providers/*.ts.
 *
 * Non-text capabilities (image generation, vision, speech, etc.) aren't on
 * this interface yet since no provider implements them today. When one is
 * wired up, extend this interface with an optional method (e.g.
 * `generateImage?(...)`) rather than inventing a parallel provider
 * abstraction — see capabilities/image.ts for the placeholder this will
 * eventually call.
 */
export interface AIProvider {
  readonly name: "nvidia" | "anthropic";

  /** Whether this provider has the env vars it needs to be called at all. */
  isConfigured(): boolean;

  complete(request: CompletionRequest): Promise<CompletionResult>;
}
