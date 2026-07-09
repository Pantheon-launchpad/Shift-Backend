import type { AIProvider } from "./provider";
import type { CompletionRequest, CompletionResult, ToolDefinition } from "../types";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const REQUEST_TIMEOUT_MS = 20_000;

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;

  private apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || undefined;
  }

  private model(): string {
    return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return !!this.apiKey();
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const key = this.apiKey();
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");

    const body: Record<string, unknown> = {
      model: this.model(),
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.6,
      messages: request.messages.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content })),
    };
    if (request.system) body.system = request.system;
    if (request.tools?.length) {
      body.tools = toAnthropicTools(request.tools);
      body.tool_choice = request.forceTool ? { type: "tool", name: request.forceTool } : { type: "auto" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as any;
    const blocks = data.content ?? [];
    const toolUse = blocks.find((b: any) => b.type === "tool_use");
    if (toolUse) {
      return { provider: "anthropic", text: null, toolCall: { name: toolUse.name, input: toolUse.input ?? {} } };
    }

    const textBlock = blocks.find((b: any) => b.type === "text");
    return { provider: "anthropic", text: textBlock?.text ?? "", toolCall: null };
  }
}
