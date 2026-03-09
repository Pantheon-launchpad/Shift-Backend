import { db } from "../db/client";
import { onboardingResponses } from "../db/schema/onboarding_responses";
import { users } from "../db/schema/users";
import { eq } from "drizzle-orm";

export async function getOnboardingStatus(userId: string) {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  return { isOnboarded: user[0]?.isOnboarded ?? false };
}

export async function saveQuestionnaire(userId: string, data: any) {
  const response = await db
    .insert(onboardingResponses)
    .values({
      userId,
      ...data,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: onboardingResponses.userId,
      set: data,
    })
    .returning();

  return response[0];
}

export async function updateGoal(userId: string, currentObjectiveText: string) {
  const response = await db
    .update(onboardingResponses)
    .set({ currentObjectiveText })
    .where(eq(onboardingResponses.userId, userId))
    .returning();

  return response[0];
}

export async function completeOnboarding(userId: string) {
  await db
    .update(users)
    .set({ isOnboarded: true })
    .where(eq(users.id, userId));

  return { success: true };
}