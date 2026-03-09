import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { users } from "./users";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  tier: text("tier"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  paymentProvider: text("payment_provider"),
  isActive: boolean("is_active"),
  createdAt: timestamp("created_at").defaultNow(),
});
