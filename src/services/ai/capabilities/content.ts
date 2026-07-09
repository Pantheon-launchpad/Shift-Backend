// Build in Public content generation. One capability, many platforms and
// formats — the platform/content-type distinctions live entirely in prompt
// construction here, not in separate code paths, so adding a platform or
// format later is a data change (PLATFORM_GUIDANCE / CONTENT_TYPE_GUIDANCE)
// rather than new logic.

import { logger } from "../../../lib/logger";
import { reason } from "./reasoning";
import type { ToolDefinition } from "../types";

export type Platform = "twitter" | "linkedin" | "medium" | "devto" | "blog";
export type ContentType =
  | "short_post"
  | "thread"
  | "founder_update"
  | "weekly_summary"
  | "milestone_announcement"
  | "long_form_article"
  | "technical_blog_post";

export interface GoalContext {
  title: string;
  progressPercent: number;
  currentMilestoneTitle: string | null;
}

export interface ActivityContext {
  taskTitle: string;
  summary: string;
  focusMinutes: number;
  createdAt: string;
}

export interface ContentGenerationInput {
  platform: Platform;
  contentType: ContentType;
  goal: GoalContext;
  /** Recent progress to draw on — a single entry for a quick share, several for a summary/article. */
  activity: ActivityContext[];
  /** Set for milestone_announcement. */
  completedMilestoneTitle?: string;
  /** Optional steering, e.g. "excited", "reflective", "matter-of-fact". */
  tone?: string;
}

export interface GeneratedContent {
  title: string | null;
  /** A single post is a 1-element array; a thread is one element per tweet/post in order. */
  segments: string[];
}

const PLATFORM_GUIDANCE: Record<Platform, string> = {
  twitter: "X (Twitter): punchy, informal, no hashtag spam (0-2 max), fine to use line breaks for rhythm.",
  linkedin: "LinkedIn: a bit more professional and reflective, still human — not corporate-speak. Short paragraphs.",
  medium: "Medium: essay-like, can open with a hook or anecdote, comfortable with narrative structure.",
  devto: "Dev.to: developer-to-developer, technical details are welcome and expected, casual but precise.",
  blog: "Personal blog: first-person, conversational, whatever voice fits an indie builder's blog.",
};

const CONTENT_TYPE_GUIDANCE: Record<ContentType, string> = {
  short_post: "A single short post (roughly 1-3 sentences for Twitter, 2-4 for LinkedIn). One idea, not a summary of everything.",
  thread: "A thread of 3-6 short posts. First post is the hook. Each subsequent post advances one idea. Return each post as its own segment.",
  founder_update: "A founder update: what shipped, what you learned, what's next. Personal and specific, not a press release.",
  weekly_summary: "A weekly progress summary across the recent activity given: what moved, what didn't, and the honest state of things.",
  milestone_announcement: "A milestone announcement: name what was completed, why it matters for the goal, and what's next. Celebratory but not over-the-top.",
  long_form_article: "A long-form article (600-1000 words) with a clear narrative arc — the problem, the approach, what was learned.",
  technical_blog_post: "A technical blog post (600-1200 words) walking through what was built, real tradeoffs made, and concrete details — code-level where relevant.",
};

const SUBMIT_CONTENT_TOOL: ToolDefinition = {
  name: "submit_content",
  description: "Submit the generated content.",
  inputSchema: {
    type: "object",
    required: ["segments"],
    properties: {
      title: { type: "string", description: "Headline/title, if this format has one (articles, milestone announcements). Omit for plain posts." },
      segments: {
        type: "array",
        minItems: 1,
        items: { type: "string" },
        description: "One element for a single post; multiple elements, in order, for a thread.",
      },
    },
  },
};

function buildContext(input: ContentGenerationInput): string {
  const lines = [
    `Goal: ${input.goal.title} (${input.goal.progressPercent}% complete${input.goal.currentMilestoneTitle ? `, currently on "${input.goal.currentMilestoneTitle}"` : ""})`,
  ];
  if (input.completedMilestoneTitle) lines.push(`Milestone just completed: ${input.completedMilestoneTitle}`);
  if (input.activity.length) {
    lines.push("Recent progress:");
    for (const a of input.activity) {
      lines.push(`- ${a.taskTitle}: ${a.summary} (${a.focusMinutes}min, ${a.createdAt})`);
    }
  }
  return lines.join("\n");
}

/** Deterministic fallback if both AI providers are down — keeps the feature functional, just less tailored. */
function generateDeterministic(input: ContentGenerationInput): GeneratedContent {
  const latest = input.activity[0];
  const base = latest ? `${latest.summary}` : `Progress on ${input.goal.title}.`;

  if (input.contentType === "thread") {
    return {
      title: null,
      segments: [
        `Update on ${input.goal.title} \u2014 ${input.goal.progressPercent}% there.`,
        base,
        input.completedMilestoneTitle ? `Just wrapped: ${input.completedMilestoneTitle}.` : "Onward.",
      ],
    };
  }
  if (input.contentType === "milestone_announcement" && input.completedMilestoneTitle) {
    return { title: `Milestone: ${input.completedMilestoneTitle}`, segments: [`Just completed "${input.completedMilestoneTitle}" on the way to ${input.goal.title}. ${base}`] };
  }
  if (input.contentType === "long_form_article" || input.contentType === "technical_blog_post" || input.contentType === "weekly_summary" || input.contentType === "founder_update") {
    const body = input.activity.map((a) => `${a.taskTitle}: ${a.summary}`).join("\n\n") || base;
    return { title: `${input.goal.title}: progress update`, segments: [body] };
  }
  return { title: null, segments: [`${base} #buildinpublic`] };
}

export async function generatePost(input: ContentGenerationInput): Promise<GeneratedContent> {
  try {
    const result = await reason({
      system: [
        "You write high-quality build-in-public content for an indie founder/developer. It must read as authentic and specific to what they actually did — never generic AI filler, never empty hype.",
        `Platform: ${PLATFORM_GUIDANCE[input.platform]}`,
        `Format: ${CONTENT_TYPE_GUIDANCE[input.contentType]}`,
        input.tone ? `Tone steer: ${input.tone}.` : "",
        "Call submit_content with the result — do not reply in free text.",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: buildContext(input),
      tools: [SUBMIT_CONTENT_TOOL],
      forceTool: SUBMIT_CONTENT_TOOL.name,
      maxTokens: input.contentType === "long_form_article" || input.contentType === "technical_blog_post" ? 2500 : 800,
    });

    if (!result.toolCall) throw new Error("Model didn't return a submit_content tool call.");
    const raw = result.toolCall.input as { title?: string; segments: string[] };
    if (!raw.segments?.length) throw new Error("submit_content returned no segments.");

    return { title: raw.title ?? null, segments: raw.segments };
  } catch (err) {
    logger.warn("[AI] content.generatePost: both providers failed, using deterministic fallback.", {
      error: err instanceof Error ? err.message : String(err),
    });
    return generateDeterministic(input);
  }
}
