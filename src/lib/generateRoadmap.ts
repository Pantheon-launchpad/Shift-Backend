// Ported near-verbatim from the frontend's src/lib/generateRoadmap.ts so
// this server implementation stays behaviorally identical to what the
// client previously did locally. Used as the deterministic engine for
// POST /v1/goals/generate-roadmap, and as the fallback if the live
// Anthropic call fails or times out (§8).

export type Difficulty = "easy" | "medium" | "hard";

export interface GeneratedTask {
  title: string;
  estimateMinutes: number;
  difficulty: Difficulty;
}

export interface GeneratedMilestone {
  week: number;
  title: string;
  status: "current" | "upcoming";
  tasks: GeneratedTask[];
}

export interface GeneratedRoadmap {
  milestones: GeneratedMilestone[];
}

interface CategoryTemplate {
  keywords: string[];
  milestones: { title: string; tasks: { title: string; minutes: number; difficulty: Difficulty }[] }[];
  hasExistingWorkTask?: { title: string; minutes: number; difficulty: Difficulty };
}

const CATEGORIES: Record<string, CategoryTemplate> = {
  writing: {
    keywords: ["book", "novel", "write", "writing", "blog", "article", "screenplay", "memoir", "poem", "newsletter"],
    milestones: [
      {
        title: "Shape the idea",
        tasks: [
          { title: "Write a one-paragraph summary of what this is about", minutes: 25, difficulty: "easy" },
          { title: "Outline the structure — chapters, sections, or acts", minutes: 45, difficulty: "medium" },
          { title: "Identify who this is for and why they'd read it", minutes: 20, difficulty: "easy" },
        ],
      },
      {
        title: "Get the first draft moving",
        tasks: [
          { title: "Write the opening section", minutes: 45, difficulty: "hard" },
          { title: "Write the next section without editing as you go", minutes: 45, difficulty: "hard" },
        ],
      },
      {
        title: "Finish the draft",
        tasks: [
          { title: "Push through the messy middle — keep writing forward", minutes: 45, difficulty: "medium" },
          { title: "Write the closing section", minutes: 45, difficulty: "medium" },
        ],
      },
      {
        title: "Revise & share",
        tasks: [
          { title: "Do a full read-through and mark what's weak", minutes: 30, difficulty: "medium" },
          { title: "Share a draft with one honest reader", minutes: 20, difficulty: "easy" },
        ],
      },
    ],
    hasExistingWorkTask: { title: "Re-read what you have and mark where it stalled", minutes: 25, difficulty: "easy" },
  },
  fitness: {
    keywords: ["run", "marathon", "fitness", "gym", "workout", "weight", "muscle", "strength", "health", "5k", "10k", "triathlon"],
    milestones: [
      {
        title: "Build the baseline",
        tasks: [
          { title: "Write down your current numbers (weight, times, reps — whatever applies)", minutes: 15, difficulty: "easy" },
          { title: "Pick a simple weekly schedule you can actually keep", minutes: 20, difficulty: "easy" },
          { title: "Do your first session and note how it felt", minutes: 40, difficulty: "medium" },
        ],
      },
      {
        title: "Make it a habit",
        tasks: [
          { title: "Complete three sessions this week", minutes: 40, difficulty: "medium" },
          { title: "Adjust the plan based on what felt too easy or too hard", minutes: 15, difficulty: "easy" },
        ],
      },
      {
        title: "Push the progression",
        tasks: [
          { title: "Increase distance, weight, or reps by a small, safe margin", minutes: 40, difficulty: "hard" },
          { title: "Add one session that specifically targets your weak point", minutes: 40, difficulty: "medium" },
        ],
      },
      {
        title: "Test & taper",
        tasks: [
          { title: "Do a trial run of the full goal (time trial, mock event, etc.)", minutes: 45, difficulty: "hard" },
          { title: "Rest and prep for the real thing", minutes: 20, difficulty: "easy" },
        ],
      },
    ],
    hasExistingWorkTask: { title: "Log your current routine so you know what to build on", minutes: 15, difficulty: "easy" },
  },
  learning: {
    keywords: ["learn", "study", "course", "certification", "exam", "language", "degree", "skill"],
    milestones: [
      {
        title: "Map what you need to know",
        tasks: [
          { title: "List the specific topics or skills this covers", minutes: 25, difficulty: "easy" },
          { title: "Find and bookmark your core learning resource", minutes: 20, difficulty: "easy" },
          { title: "Do a quick self-check on what you already know", minutes: 20, difficulty: "easy" },
        ],
      },
      {
        title: "Build the fundamentals",
        tasks: [
          { title: "Work through the first core lesson or chapter", minutes: 45, difficulty: "medium" },
          { title: "Practice with a small exercise, not just reading", minutes: 30, difficulty: "medium" },
        ],
      },
      {
        title: "Apply it to something real",
        tasks: [
          { title: "Use what you've learned on a tiny real project or problem", minutes: 45, difficulty: "hard" },
          { title: "Get feedback from someone further along", minutes: 20, difficulty: "medium" },
        ],
      },
      {
        title: "Prove it",
        tasks: [
          { title: "Take a practice test, quiz, or do a dry run", minutes: 40, difficulty: "medium" },
          { title: "Review your weak spots one more time", minutes: 25, difficulty: "easy" },
        ],
      },
    ],
    hasExistingWorkTask: { title: "Review what you've already covered before continuing", minutes: 20, difficulty: "easy" },
  },
  software: {
    keywords: ["app", "saas", "software", "website", "platform", "startup", "product", "tool", "api", "ai", "launch"],
    milestones: [
      {
        title: "Validate the idea",
        tasks: [
          { title: "Write the one-sentence pitch for your landing page", minutes: 25, difficulty: "easy" },
          { title: "Talk to 3 potential users about the problem", minutes: 45, difficulty: "medium" },
          { title: "Sketch the core user flow", minutes: 30, difficulty: "easy" },
        ],
      },
      {
        title: "Build the MVP",
        tasks: [
          { title: "Set up the project scaffold", minutes: 30, difficulty: "easy" },
          { title: "Build the core feature end to end", minutes: 60, difficulty: "hard" },
        ],
      },
      {
        title: "Launch to first users",
        tasks: [
          { title: "Write launch copy", minutes: 30, difficulty: "easy" },
          { title: "Share with your first 10 users", minutes: 45, difficulty: "medium" },
        ],
      },
      {
        title: "Grow & iterate",
        tasks: [{ title: "Review first feedback and prioritize fixes", minutes: 30, difficulty: "medium" }],
      },
    ],
    hasExistingWorkTask: { title: "Audit what's already built and list what's missing", minutes: 25, difficulty: "easy" },
  },
};

const DEFAULT_CATEGORY: CategoryTemplate = CATEGORIES.software;

function detectCategory(goalTitle: string): CategoryTemplate {
  const lower = goalTitle.toLowerCase();
  for (const key of Object.keys(CATEGORIES)) {
    if (CATEGORIES[key].keywords.some((kw) => lower.includes(kw))) return CATEGORIES[key];
  }
  return DEFAULT_CATEGORY;
}

function parseDailyMinutes(answer: string): number | null {
  const lower = answer.toLowerCase();
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60);
  const minMatch = lower.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const bareNumber = lower.match(/^\s*(\d+)\s*$/);
  if (bareNumber) return parseInt(bareNumber[1], 10);
  return null;
}

function scaleMinutes(base: number, dailyBudget: number | null): number {
  if (!dailyBudget || dailyBudget <= 0) return base;
  const ratio = dailyBudget / 40;
  const scaled = Math.round((base * Math.min(Math.max(ratio, 0.4), 2)) / 5) * 5;
  return Math.min(Math.max(scaled, 15), 90);
}

const HAS_EXISTING_WORK_HINTS = ["have", "already", "existing", "built", "started", "prototype", "draft", "mockup", "sketch", "some"];
const NOTHING_HINTS = ["nothing", "none", "scratch", "haven't", "not yet", "no"];

function hasExistingWork(answer: string): boolean {
  const lower = answer.toLowerCase().trim();
  if (NOTHING_HINTS.some((h) => lower.includes(h))) return false;
  return HAS_EXISTING_WORK_HINTS.some((h) => lower.includes(h));
}

/**
 * Builds a roadmap shaped by what the person actually typed: category comes
 * from keywords in the goal itself, task-length comes from their stated
 * daily time budget, and the first task adapts to whether they're starting
 * from zero or already have something in progress.
 */
export function generateRoadmapDeterministic(goalTitle: string, answers: string[]): GeneratedRoadmap {
  const [, timeAnswer, existingAnswer] = answers;
  const category = detectCategory(goalTitle);
  const dailyBudget = timeAnswer ? parseDailyMinutes(timeAnswer) : null;
  const startsFromSomething = existingAnswer ? hasExistingWork(existingAnswer) : false;

  const milestones: GeneratedMilestone[] = category.milestones.map((m, mi) => ({
    week: mi + 1,
    title: m.title,
    status: mi === 0 ? "current" : "upcoming",
    tasks: m.tasks.map((t, ti) => {
      const useExistingWorkVariant = mi === 0 && ti === 0 && startsFromSomething && category.hasExistingWorkTask;
      const source = useExistingWorkVariant ? category.hasExistingWorkTask! : t;
      return {
        title: source.title,
        estimateMinutes: scaleMinutes(source.minutes, dailyBudget),
        difficulty: source.difficulty,
      };
    }),
  }));

  return { milestones };
}
