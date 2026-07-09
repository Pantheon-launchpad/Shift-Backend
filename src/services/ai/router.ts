import type { AIProvider } from "./providers/provider";
import { NvidiaProvider } from "./providers/nvidia";
import { AnthropicProvider } from "./providers/anthropic";
import type { CompletionRequest, CompletionResult } from "./types";
import { AIServiceError } from "./types";
import { logger } from "../../lib/logger";

/**
 * Routes every completion request to NVIDIA first, falling back to
 * Anthropic on any failure (timeout, rate limit, 5xx, network error). This
 * is the only place in the codebase that knows both providers exist —
 * everything above this (capabilities/*, and everything above that) only
 * ever sees a CompletionResult with `provider` as metadata.
 *
 * Recovery: rather than re-trying NVIDIA on every single request once it's
 * marked down (which would add its timeout latency to every user-facing
 * call while it's still broken), a background health check pings it every
 * `AI_NVIDIA_HEALTH_CHECK_INTERVAL_MS` (default 30s) with a minimal request
 * and flips traffic back the moment it succeeds. This keeps the "switch
 * back automatically" behavior transparent to callers without making a
 * known outage slow down every request in the meantime.
 */
export class AIRouter {
  private nvidiaHealthy = true;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private nvidia: AIProvider = new NvidiaProvider(),
    private anthropic: AIProvider = new AnthropicProvider()
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const causes: unknown[] = [];
    const tryNvidia = this.nvidia.isConfigured() && this.nvidiaHealthy;

    if (tryNvidia) {
      try {
        logger.info("[AI] Provider: NVIDIA");
        return await this.nvidia.complete(request);
      } catch (err) {
        causes.push(err);
        logger.warn("[WARNING] NVIDIA unavailable.");
        logger.warn(`[AI] Reason: ${err instanceof Error ? err.message : String(err)}`);
        this.markNvidiaDown();
        logger.info("[AI] Falling back to Anthropic...");
      }
    }

    if (!this.anthropic.isConfigured()) {
      throw new AIServiceError(
        "No AI provider is available. Set NVIDIA_API_KEY and/or ANTHROPIC_API_KEY.",
        causes
      );
    }

    try {
      logger.info(`[AI] Provider: Anthropic${tryNvidia ? " (fallback)" : ""}`);
      return await this.anthropic.complete(request);
    } catch (err) {
      causes.push(err);
      throw new AIServiceError("Both NVIDIA and Anthropic failed to complete this request.", causes);
    }
  }

  private markNvidiaDown() {
    if (!this.nvidiaHealthy) return; // already down and being polled
    this.nvidiaHealthy = false;
    this.startHealthChecks();
  }

  private startHealthChecks() {
    if (this.healthCheckTimer) return;
    const intervalMs = Number(process.env.AI_NVIDIA_HEALTH_CHECK_INTERVAL_MS) || 30_000;

    this.healthCheckTimer = setInterval(async () => {
      if (!this.nvidia.isConfigured()) return; // no key — don't bother polling
      try {
        await this.nvidia.complete({ messages: [{ role: "user", content: "ping" }], maxTokens: 1 });
        this.nvidiaHealthy = true;
        logger.info("[AI] NVIDIA restored.");
        logger.info("[AI] Switched back to NVIDIA.");
        if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      } catch {
        // Still down — keep polling silently; every failed request already logs its own warning.
      }
    }, intervalMs);

    // Don't let this timer keep the process alive on its own (e.g. during tests/shutdown).
    this.healthCheckTimer.unref?.();
  }
}

export const aiRouter = new AIRouter();
