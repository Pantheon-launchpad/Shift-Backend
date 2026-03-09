import { db } from "../db/client";
import { userProfiles } from "../db/schema/user_profiles";
import { users } from "../db/schema/users";
import { streaks } from "../db/schema/streaks";
import { focusSessions } from "../db/schema/focus_sessions";
import { NotFoundError } from "../utils/errors";

export async function getPublicProfile(username: string) {
  const profile = await db
    .select()
    .from(userProfiles)
    .where(userProfiles.username.eq(username));
  if (!profile[0]) throw new NotFoundError("Profile not found");
  // Fetch streak, focus hours, etc. (mocked for brevity)
  return {
    username: profile[0].username,
    displayName: profile[0].displayName,
    bio: profile[0].bio,
    avatarUrl: "",
    streak: { current: 0, longest: 0 },
    totalFocusHours: 0,
  };
}

export async function getMyProfile(userId: string) {
  // Fetch user, profile, onboarding, settings, streak, subscription, purchases (mocked)
  return {
    user: {},
    profile: {},
    onboarding: {},
    settings: {},
    streak: {},
    subscription: {},
    purchases: [],
  };
}

export async function updateMyProfile(userId: string, data: any) {
  const updated = await db
    .update(userProfiles)
    .set(data)
    .where(userProfiles.userId.eq(userId))
    .returning();
  return updated[0];
}
