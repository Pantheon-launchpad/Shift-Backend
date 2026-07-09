import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import http from "http";
import rateLimit from "express-rate-limit";
import { mountDocs } from "./docs/docs-route";
import { errorHandler, requestIdMiddleware } from "./lib/errors";
import { initWebSocketHub } from "./ws/hub";

import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { goalsRouter } from "./routes/goals";
import { plannerRouter, goalPlannerRouter } from "./routes/planner";
import { activityRouter } from "./routes/activity";
import { buildInPublicRouter } from "./routes/buildInPublic";
import { notificationsRouter } from "./routes/notifications";
import { syncRouter } from "./routes/sync";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json({ limit: "2mb" }));
app.use(requestIdMiddleware);

// Static hosting for locally-rendered build-in-public card images (§10 —
// swap for S3/R2 in production; see src/lib/storage.ts).
app.use("/static/cards", express.static(path.join(process.cwd(), "public", "cards")));

// Global rate limit as a floor; tighten further per-route (e.g. /auth/login)
// if abuse shows up in practice.
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

mountDocs(app); // GET /docs, /openapi.yaml, /openapi.json

const v1 = express.Router();
v1.use("/auth", authRouter);
v1.use("/me", meRouter);
v1.use("/goals", goalsRouter);
v1.use("/goals", plannerRouter); // /goals/intake/next-question, /goals/generate-roadmap
v1.use("/goals/:id/planner-messages", goalPlannerRouter);
v1.use("/activity", activityRouter);
v1.use("/build-in-public", buildInPublicRouter);
v1.use("/notifications", notificationsRouter);
v1.use("/sync", syncRouter);

app.use("/v1", v1);

app.use((req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}`, requestId: (req as any).requestId } });
});

app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
initWebSocketHub(server);

server.listen(port, () => {
  console.log(`Shift API listening on http://localhost:${port}`);
  console.log(`Swagger docs at        http://localhost:${port}/docs`);
});
