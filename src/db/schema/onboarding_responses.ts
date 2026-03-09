import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const onboardingResponses = pgTable("onboarding_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  objectiveType: text("objective_type"),
  lockdownIntensity: text("lockdown_intensity"),
  preferredFocusTime: text("preferred_focus_time"),
  socialAccountability: text("social_accountability"),
  currentObjectiveText: text("current_objective_text"),
  createdAt: timestamp("created_at").defaultNow(),
});
