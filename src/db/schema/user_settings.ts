import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  lockdownDefaultIntensity: text("lockdown_default_intensity"),
  adaptiveTriggersEnabled: boolean("adaptive_triggers_enabled"),
  behaviorDetectionSettings: jsonb("behavior_detection_settings"),
  aiCoachingStyle: text("ai_coaching_style"),
  scheduleAwareness: jsonb("schedule_awareness"),
  integrations: jsonb("integrations"),
  privacy: jsonb("privacy"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
