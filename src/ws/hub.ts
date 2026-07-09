// Minimal implementation of §9's real-time layer: one WebSocket connection
// per authenticated session, used for cross-device invalidation signals and
// live notifications. Planner token streaming (planner_token/planner_done)
// is left as a follow-up hook — see the comment on `streamToUser` below —
// since it depends on wiring the Anthropic streaming API, which is out of
// scope for the initial non-streaming planner endpoint per §8's build order
// ("ship non-streaming first; add streaming once that's solid").

import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";
import { verifyAccessToken } from "../lib/tokens";

const connectionsByUser = new Map<string, Set<WebSocket>>();

export function initWebSocketHub(server: Server) {
  const wss = new WebSocketServer({ server, path: "/v1/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");

    let userId: string;
    try {
      if (!token) throw new Error("missing token");
      userId = verifyAccessToken(token).sub;
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }

    if (!connectionsByUser.has(userId)) connectionsByUser.set(userId, new Set());
    connectionsByUser.get(userId)!.add(ws);

    ws.on("close", () => {
      connectionsByUser.get(userId)?.delete(ws);
      if (connectionsByUser.get(userId)?.size === 0) connectionsByUser.delete(userId);
    });
  });

  return wss;
}

function sendToUser(userId: string, payload: unknown) {
  const sockets = connectionsByUser.get(userId);
  if (!sockets) return;
  const message = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(message);
  }
}

/** Broadcast that a resource changed, so other active sessions re-GET it (§9). */
export function broadcastInvalidate(userId: string, resource: string, id: string, updatedAt: string) {
  sendToUser(userId, { type: "invalidate", resource, id, updatedAt });
}

/** Push a notification live rather than waiting for the next poll (§9). */
export function broadcastNotification(userId: string, notification: unknown) {
  sendToUser(userId, { type: "notification", notification });
}
