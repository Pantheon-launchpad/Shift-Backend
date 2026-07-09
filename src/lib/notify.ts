// §11: single call site that never needs to know or care which platforms a
// given user has. Always writes to `notifications` (so it shows in-app
// regardless of push delivery success), then fans out over whatever
// channels are actually wired up.

import { db } from "../db/client";
import { notifications, pushTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { broadcastNotification } from "../ws/hub";

export interface SendNotificationInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendNotification(userId: string, input: SendNotificationInput) {
  const [row] = await db.insert(notifications).values({ userId, title: input.title, body: input.body }).returning();

  const notification = {
    id: row.id,
    title: row.title,
    body: row.body,
    readAt: null,
    createdAt: row.createdAt.toISOString(),
  };

  // Live in-app push over the WebSocket connection, if the user has one open.
  broadcastNotification(userId, notification);

  // Web Push / FCM fan-out. Stubbed: wire up `web-push` + VAPID keys and an
  // FCM service account (§13) to actually deliver these; without those env
  // vars configured, this just logs what *would* have been sent.
  const tokens = await db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
  for (const t of tokens) {
    if (t.platform === "web") {
      console.log(`[stub] would send Web Push to token ${t.id}: ${input.title}`);
    } else {
      console.log(`[stub] would send FCM push (${t.platform}) to token ${t.id}: ${input.title}`);
    }
  }

  return notification;
}
