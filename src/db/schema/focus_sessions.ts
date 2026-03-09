import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const focusSessions = pgTable("focus_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  taskDescription: text("task_description"),
  aiEnhancedTask: text("ai_enhanced_task"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  durationMinutes: integer("duration_minutes"),
  interruptionsCount: integer("interruptions_count"),
  completed: boolean("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});
