import type { AIProvider } from "./provider";
import type { CompletionRequest, CompletionResult, ToolDefinition } from "../types";

// NVIDIA's hosted NIM endpoint (build.nvidia.com) is OpenAI-compatible:
// POST {base}/chat/completions with a standard messages/tools/tool_choice
// body. nemotron-super-49b-v1.5 is post-trained for tool calling, so the
// same forced-tool pattern used for Anthropic works here too.
const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5";
const REQUEST_TIMEOUT_MS = 20_000;

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export class NvidiaProvider implements AIProvider {
  readonly name = "nvidia" as const;

  private apiKey(): string | undefined {
    return process.env.NVIDIA_API_KEY || undefined;
  }

  private baseUrl(): string {
    return process.env.NVIDIA_BASE_URL || DEFAULT_BASE_URL;
  }

  private model(): string {
    return process.env.NVIDIA_MODEL || DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return !!this.apiKey();
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const key = this.apiKey();
    if (!key) throw new Error("NVIDIA_API_KEY is not set.");

    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const body: Record<string, unknown> = {
      model: this.model(),
      messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.6,
      top_p: 0.95,
      stream: false,
    };
    if (request.tools?.length) {
      body.tools = toOpenAITools(request.tools);
      body.tool_choice = request.forceTool ? { type: "function", function: { name: request.forceTool } } : "auto";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`NVIDIA API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as any;
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("NVIDIA API returned no message.");

    const toolCall = message.tool_calls?.[0];
    if (toolCall) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error("NVIDIA API returned malformed tool_call arguments.");
      }
      return { provider: "nvidia", text: null, toolCall: { name: toolCall.function.name, input } };
    }

    return { provider: "nvidia", text: message.content ?? "", toolCall: null };
  }
}
