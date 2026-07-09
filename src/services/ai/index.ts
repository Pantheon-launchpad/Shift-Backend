// The single entry point for every AI-powered feature in the app. No page,
// route, or other module should import from services/ai/providers/* or
// services/ai/router.ts directly — everything goes through `ai.<capability>.<fn>`
// so the rest of the app never knows NVIDIA or Anthropic exist, per the
// architecture's core rule.
//
//   import { ai } from "../services/ai";
//   const roadmap = await ai.planner.generateRoadmap(title, answers);

import * as chat from "./capabilities/chat";
import * as reasoning from "./capabilities/reasoning";
import * as planner from "./capabilities/planner";
import * as content from "./capabilities/content";
import * as summarize from "./capabilities/summarize";
import * as reflection from "./capabilities/reflection";
import * as image from "./capabilities/image";
import * as vision from "./capabilities/vision";
import * as video from "./capabilities/video";
import * as audio from "./capabilities/audio";
import * as speech from "./capabilities/speech";
import * as embeddings from "./capabilities/embeddings";
import * as moderation from "./capabilities/moderation";

export const ai = {
  chat,
  reasoning,
  planner,
  content,
  summarize,
  reflection,
  // Placeholders — see each file for what's needed to light them up.
  image,
  vision,
  video,
  audio,
  speech,
  embeddings,
  moderation,
};

export type { CompletionResult, ToolDefinition, ChatMessage } from "./types";
export { AIServiceError, AICapabilityNotImplementedError } from "./types";
