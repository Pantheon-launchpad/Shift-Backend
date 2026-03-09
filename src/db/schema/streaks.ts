import {
  pgTable,
  uuid,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const streaks = pgTable("streaks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  currentStreakDays: integer("current_streak_days").default(0),
  longestStreak: integer("longest_streak").default(0),
  lastSessionDate: date("last_session_date"),
  totalFocusHours: doublePrecision("total_focus_hours"),
  consecutiveDaysCompleted: integer("consecutive_days_completed").default(0),
  streakHeatmapData: jsonb("streak_heatmap_data"),
  focusScore: doublePrecision("focus_score"),
  commitmentScore: doublePrecision("commitment_score"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
