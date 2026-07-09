// Ported from the frontend's useAppStore.ts (advanceGoal + computeProgressUpdate),
// which the spec's §6 Progress section explicitly calls out as the logic to
// keep server-side so completeDebrief (focus_session) and logProgressFromChat
// (planner_chat) can never silently diverge — "one function, two callers".

import { db } from "../db/client";
import { goals, milestones, tasks, streaks } from "../db/schema";
import { and, asc, eq } from "drizzle-orm";

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export interface AdvanceResult {
  advanced: boolean;
  milestoneAdvanced: boolean;
  goalCompleted: boolean;
}

/**
 * Marks the current milestone's next unfinished task done. If that completes
 * every task in the current milestone, the milestone is marked 'done' and
 * the next 'upcoming' milestone (if any) is promoted to 'current'. If there
 * is no next milestone, the goal itself is marked complete.
 */
export async function advanceGoal(goalId: string): Promise<AdvanceResult> {
  const goalMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.goalId, goalId))
    .orderBy(asc(milestones.position));

  const currentMilestone = goalMilestones.find((m) => m.status === "current");
  if (!currentMilestone) return { advanced: false, milestoneAdvanced: false, goalCompleted: false };

  const milestoneTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.milestoneId, currentMilestone.id))
    .orderBy(asc(tasks.position));

  const nextTask = milestoneTasks.find((t) => !t.done);
  if (!nextTask) return { advanced: false, milestoneAdvanced: false, goalCompleted: false };

  await db.update(tasks).set({ done: true, updatedAt: new Date() }).where(eq(tasks.id, nextTask.id));

  const milestoneComplete = milestoneTasks.every((t) => t.done || t.id === nextTask.id);
  let milestoneAdvanced = false;
  let goalCompleted = false;

  if (milestoneComplete) {
    await db.update(milestones).set({ status: "done", updatedAt: new Date() }).where(eq(milestones.id, currentMilestone.id));
    milestoneAdvanced = true;

    const nextUpcoming = goalMilestones.find((m) => m.position > currentMilestone.position && m.status === "upcoming");
    if (nextUpcoming) {
      await db.update(milestones).set({ status: "current", updatedAt: new Date() }).where(eq(milestones.id, nextUpcoming.id));
    } else {
      goalCompleted = true;
      await db.update(goals).set({ completed: true, completedAt: new Date(), updatedAt: new Date() }).where(eq(goals.id, goalId));
    }
  }

  return { advanced: true, milestoneAdvanced, goalCompleted };
}

export interface StreakResult {
  count: number;
  longest: number;
}

/** Same day-gap streak logic as the frontend store: consecutive day = +1, gap = reset to 1, same day = no-op. */
export async function updateStreak(userId: string): Promise<StreakResult> {
  const [existing] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);

  const today = startOfDay(new Date());
  const todayStr = today.toISOString().slice(0, 10);

  if (!existing) {
    await db.insert(streaks).values({ userId, streakCount: 1, longestStreak: 1, lastCompletionDay: todayStr });
    return { count: 1, longest: 1 };
  }

  let streakCount = existing.streakCount;
  if (!existing.lastCompletionDay) {
    streakCount = 1;
  } else {
    const last = new Date(existing.lastCompletionDay);
    const gapDays = Math.round((today.getTime() - startOfDay(last).getTime()) / DAY_MS);
    if (gapDays === 0) streakCount = existing.streakCount;
    else if (gapDays === 1) streakCount = existing.streakCount + 1;
    else streakCount = 1;
  }

  const longest = Math.max(existing.longestStreak, streakCount);

  await db
    .update(streaks)
    .set({ streakCount, longestStreak: longest, lastCompletionDay: todayStr })
    .where(eq(streaks.userId, userId));

  return { count: streakCount, longest };
}

/** Display-only "is the streak still alive" check — decays visually without needing an explicit reset. */
export function currentStreakDisplay(streakCount: number, lastCompletionDay: string | null): number {
  if (!lastCompletionDay) return 0;
  const gapDays = Math.round((startOfDay(new Date()).getTime() - startOfDay(new Date(lastCompletionDay)).getTime()) / DAY_MS);
  return gapDays <= 1 ? streakCount : 0;
}
