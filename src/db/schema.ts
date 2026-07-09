import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null if OAuth-only account
  name: text("name").notNull().default(""),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthConnections = pgTable(
  "oauth_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'github' | 'google' | 'figma'
    providerUserId: text("provider_user_id").notNull(),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerUnique: unique().on(t.provider, t.providerUserId),
  })
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    deviceLabel: text("device_label"),
    familyId: uuid("family_id").notNull(), // shared across a rotation chain, for theft detection
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("refresh_tokens_user_idx").on(t.userId),
    familyIdx: index("refresh_tokens_family_idx").on(t.familyId),
  })
);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    archived: boolean("archived").notNull().default(false),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("goals_user_idx").on(t.userId) })
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(), // 'done' | 'current' | 'upcoming'
    position: integer("position").notNull(), // explicit ordering, don't rely on week/created_at
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ goalIdx: index("milestones_goal_idx").on(t.goalId) })
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    milestoneId: uuid("milestone_id").notNull().references(() => milestones.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    estimateMinutes: integer("estimate_minutes").notNull(),
    difficulty: text("difficulty").notNull(), // 'easy' | 'medium' | 'hard'
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ milestoneIdx: index("tasks_milestone_idx").on(t.milestoneId) })
);

export const activityEntries = pgTable(
  "activity_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    taskTitle: text("task_title").notNull(),
    rawText: text("raw_text").notNull(),
    aiSummary: text("ai_summary").notNull(),
    link: text("link"),
    focusMinutes: integer("focus_minutes").notNull().default(0),
    source: text("source").notNull(), // 'focus_session' | 'planner_chat'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("activity_user_idx").on(t.userId, t.createdAt),
    goalIdx: index("activity_goal_idx").on(t.goalId),
  })
);

export const plannerMessages = pgTable(
  "planner_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    fromRole: text("from_role").notNull(), // 'ai' | 'user'
    text: text("text").notNull(),
    actionTaskId: uuid("action_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ goalIdx: index("planner_messages_goal_idx").on(t.goalId, t.createdAt) })
);

export const buildInPublicPosts = pgTable(
  "build_in_public_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    twitterText: text("twitter_text").notNull(),
    linkedinText: text("linkedin_text").notNull(),
    cardHeadline: text("card_headline").notNull(),
    cardSubline: text("card_subline").notNull(),
    cardImageUrl: text("card_image_url"), // populated once the render job finishes
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("bip_user_idx").on(t.userId, t.createdAt) })
);

// Broader multi-platform/multi-format content generation (threads, founder
// updates, weekly summaries, milestone announcements, long-form articles,
// technical blog posts) — separate from build_in_public_posts above, which
// stays scoped to the original "share a quick card from one activity entry"
// flow. `segments` is always a JSON-encoded string[]: one element for a
// single post, one element per post for a thread.
export const generatedPosts = pgTable(
  "generated_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // 'twitter' | 'linkedin' | 'medium' | 'devto' | 'blog'
    contentType: text("content_type").notNull(), // see ContentType in services/ai/capabilities/content.ts
    title: text("title"),
    segments: text("segments").notNull(), // JSON-encoded string[]
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("generated_posts_user_idx").on(t.userId, t.createdAt) })
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("notifications_user_idx").on(t.userId, t.createdAt) })
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  aiSuggestions: boolean("ai_suggestions").notNull().default(true),
  emailReminders: boolean("email_reminders").notNull().default(true),
  backgroundGlow: boolean("background_glow").notNull().default(true),
  theme: text("theme").notNull().default("dark"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const streaks = pgTable("streaks", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  streakCount: integer("streak_count").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletionDay: date("last_completion_day"),
});

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // 'web' | 'ios' | 'android'
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userTokenUnique: unique().on(t.userId, t.token) })
);

// Backs the Idempotency-Key header contract from §3: cache the response for
// 24h and replay it on retry instead of re-applying the mutation.
export const idempotencyRecords = pgTable("idempotency_records", {
  key: text("key").primaryKey(),
  userId: uuid("user_id").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
