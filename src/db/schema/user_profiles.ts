import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  bio: text("bio"),
  profileVisibility: text("profile_visibility"),
  streakSharingOptIn: boolean("streak_sharing_opt_in").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
