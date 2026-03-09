import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as users from "./schema/users";
import * as userProfiles from "./schema/user_profiles";
import * as onboardingResponses from "./schema/onboarding_responses";
import * as userSettings from "./schema/user_settings";
import * as streaks from "./schema/streaks";
import * as focusSessions from "./schema/focus_sessions";
import * as subscriptions from "./schema/subscriptions";
import * as purchases from "./schema/purchases";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, {
  schema: {
    ...users,
    ...userProfiles,
    ...onboardingResponses,
    ...userSettings,
    ...streaks,
    ...focusSessions,
    ...subscriptions,
    ...purchases,
  },
});

export default db;
