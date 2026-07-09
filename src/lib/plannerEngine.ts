// Ported from the frontend's src/lib/plannerEngine.ts. Used as:
//  - the intake question sequence behind POST /v1/goals/intake/next-question
//  - the deterministic fallback reply behind POST /v1/goals/:id/planner-messages
//    when ANTHROPIC_API_KEY isn't set, or the live call fails (§8).

export type IntakeKey = "goal" | "doneLooksLike" | "timePerDay" | "existingWork" | "deadline";

export interface IntakeStep {
  key: IntakeKey;
  prompt: (ctx: { goal: string; answers: string[] }) => string;
}

export const INTAKE_STEPS: IntakeStep[] = [
  {
    key: "goal",
    prompt: () =>
      "Hey! I'm the AI Planner — tell me what you're trying to achieve, and I'll help you turn it into a real roadmap. What's the goal?",
  },
  {
    key: "doneLooksLike",
    prompt: ({ goal }) =>
      `Got it — "${goal}". Let's make this concrete: what does *done* actually look like? A live product, a first user, a finished draft — be specific.`,
  },
  {
    key: "timePerDay",
    prompt: () => 'Good. How much time can you realistically give this each day? Even "20 minutes" is useful — it changes how I size your tasks.',
  },
  {
    key: "existingWork",
    prompt: () => "Is there anything already in progress — a draft, a prototype, some research — or are we starting from zero?",
  },
  {
    key: "deadline",
    prompt: () => 'Last one: any hard deadline I should plan around? If not, just say "no deadline."',
  },
];

/** Given how many previous answers exist, returns the next question, or null if intake is complete. */
export function nextIntakeQuestion(previousAnswers: string[]): { question: string; isLastQuestion: boolean } | null {
  const stepIndex = previousAnswers.length;
  if (stepIndex >= INTAKE_STEPS.length) return null;
  const step = INTAKE_STEPS[stepIndex];
  const goal = previousAnswers[0] ?? "";
  return {
    question: step.prompt({ goal, answers: previousAnswers }),
    isLastQuestion: stepIndex === INTAKE_STEPS.length - 1,
  };
}

// ---------------------------------------------------------------------------
// Post-creation chat: answering questions about an existing goal/roadmap.
// ---------------------------------------------------------------------------

export interface PlannerTask {
  id: string;
  title: string;
  done: boolean;
}

export interface PlannerMilestone {
  id: string;
  title: string;
  status: "done" | "current" | "upcoming";
  tasks: PlannerTask[];
}

export interface PlannerContext {
  goalTitle: string;
  goalCompleted: boolean;
  milestones: PlannerMilestone[];
  currentMilestone: PlannerMilestone | null;
  todayTask: PlannerTask | null;
  streak: number;
}

export interface PlannerReply {
  text: string;
  offerCompleteTaskId?: string;
}

const DONE_PATTERNS = /\b(done|finished|complete[d]?|shipped|wrapped up|knocked out|did it|got it done)\b/i;
const STUCK_PATTERNS = /\b(stuck|stall|procrastinat|can't start|dont know where|don't know where|blocked|overwhelmed)\b/i;
const PROGRESS_PATTERNS = /\b(how am i doing|progress|status|where am i)\b/i;
const NEXT_PATTERNS = /\b(what's next|whats next|next task|next step)\b/i;
const WHY_PATTERNS = /\bwhy\b/i;
const EXPLAIN_PATTERNS = /\b(explain|what is|what's|help me understand)\b/i;

function getUpcomingTasks(milestones: PlannerMilestone[], limit = 3): PlannerTask[] {
  const result: PlannerTask[] = [];
  for (const milestone of milestones) {
    if (milestone.status === "done") continue;
    for (const task of milestone.tasks) {
      if (!task.done) result.push(task);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

export function plannerReplyDeterministic(message: string, ctx: PlannerContext): PlannerReply {
  const { goalTitle, goalCompleted, milestones, currentMilestone, todayTask, streak } = ctx;

  if (goalCompleted) {
    return {
      text: `"${goalTitle}" is already fully complete — every milestone is done. Want to start planning your next goal instead?`,
    };
  }

  if (DONE_PATTERNS.test(message) && todayTask) {
    return {
      text: `Nice work. Want me to mark "${todayTask.title}" as done and move your roadmap forward?`,
      offerCompleteTaskId: todayTask.id,
    };
  }

  if (PROGRESS_PATTERNS.test(message)) {
    const total = milestones.reduce((n, m) => n + m.tasks.length, 0);
    const done = milestones.reduce((n, m) => n + m.tasks.filter((t) => t.done).length, 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return {
      text: `You're at ${pct}% on "${goalTitle}" (${done}/${total} tasks) and currently on "${currentMilestone?.title ?? "the last milestone"}". Your streak is ${streak} day${streak === 1 ? "" : "s"}.`,
    };
  }

  if (NEXT_PATTERNS.test(message)) {
    const upcoming = getUpcomingTasks(milestones, 3);
    if (upcoming.length === 0) return { text: "There's nothing left on this roadmap — it's fully complete." };
    const list = upcoming.map((u) => `• ${u.title}`).join("\n");
    return { text: `Here's what's coming up:\n${list}` };
  }

  if (STUCK_PATTERNS.test(message)) {
    return {
      text: todayTask
        ? `That's normal. Lower the bar for today: just open whatever "${todayTask.title}" requires and do the smallest possible version, even a bad one. Momentum beats quality on restart days.`
        : "Start with the smallest version of the very next thing — you can improve it once it exists.",
    };
  }

  if (WHY_PATTERNS.test(message) && currentMilestone) {
    return {
      text: `"${currentMilestone.title}" comes next because it's the gap between where "${goalTitle}" is now and the next real checkpoint on the roadmap.`,
    };
  }

  if (EXPLAIN_PATTERNS.test(message) && todayTask) {
    return {
      text: `"${todayTask.title}" is part of the "${currentMilestone?.title}" milestone — it's meant to be one concrete, finishable piece of progress, not the whole milestone at once.`,
    };
  }

  const fallbacks = [
    `Tell me more about where you're at with "${goalTitle}" and I can help you figure out the next move.`,
    "Want a breakdown of today's task, a progress check, or a nudge on where to focus?",
    `I'm tracking "${goalTitle}" with you — ask me about your progress, what's next, or say the word if you've finished today's task.`,
  ];
  return { text: fallbacks[Math.floor(Math.random() * fallbacks.length)] };
}
