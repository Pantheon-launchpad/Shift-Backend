# Shift backend

Full implementation of `BACKEND-API-SPEC.md` — Express + TypeScript, Drizzle
ORM over PostgreSQL, JWT auth with refresh-token rotation, server-side AI
(Claude, with deterministic fallbacks), server-rendered build-in-public card
images, WebSocket live-sync, and interactive Swagger docs at `/docs`.

Verified end-to-end against a real local Postgres in dev: signup → login →
token refresh/rotation/theft-detection → goal creation → AI-planner intake →
roadmap generation → progress logging → milestone/goal completion cascade →
streaks → planner chat → activity log → build-in-public card render (real
PNG) → settings → docs. All green.

## Why Drizzle instead of Prisma

The spec lists both as options. Prisma needs to download engine binaries
from `binaries.prisma.sh` at `generate` time; if your environment blocks
that domain, `prisma generate` will fail with a checksum-fetch error. Drizzle
+ `pg` are pure npm packages with no binary download step, so this is what's
implemented. Swapping to Prisma later is straightforward — the schema in
`src/db/schema.ts` maps 1:1 to a `schema.prisma`, and no route code depends
on Drizzle-specific APIs.

## Setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL, JWT secrets, etc.
npm run db:generate    # generates SQL from src/db/schema.ts into ./drizzle
npm run db:migrate     # applies it to DATABASE_URL
npm run dev            # starts on :3000 with hot reload
```

Open **http://localhost:3000/docs** for interactive Swagger UI (Bearer auth
persists across reloads — hit `/auth/signup` there to get a token, click
"Authorize", paste it in).

### Env vars

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/db` |
| `JWT_ACCESS_SECRET` | yes | random string, 15-min access tokens |
| `JWT_REFRESH_PEPPER` | yes | random string, added before hashing refresh tokens at rest |
| `ANTHROPIC_API_KEY` | no | if unset, AI Planner endpoints use the deterministic fallback engines (still fully functional — see below) |
| `PORT` | no | default `3000` |
| `CORS_ORIGIN` | no | comma-separated allowed origins; default `*` |
| `PUBLIC_BASE_URL` | no | used to build card image URLs; default `http://localhost:$PORT` |

## AI service architecture (`src/services/ai`)

Every AI-powered feature goes through one façade — `import { ai } from
"../services/ai"` — which exposes capabilities (`ai.planner`, `ai.content`,
`ai.summarize`, `ai.chat`, `ai.reasoning`, `ai.reflection`, plus placeholders
for `image`/`vision`/`video`/`audio`/`speech`/`embeddings`/`moderation`).
Nothing outside `src/services/ai/` knows NVIDIA or Anthropic exist.

**Provider routing**: NVIDIA (`nvidia/llama-3.3-nemotron-super-49b-v1.5`,
OpenAI-compatible tool calling) is primary; Anthropic is fallback. On any
NVIDIA failure (timeout, rate limit, 5xx, network error), the request
transparently retries against Anthropic and NVIDIA is marked down. Rather
than re-trying a known-broken NVIDIA on every subsequent request (which
would add its timeout latency to every call while it's down), a background
health check pings it every `AI_NVIDIA_HEALTH_CHECK_INTERVAL_MS` (default
30s) and flips traffic back the moment it succeeds — logged as `[AI] NVIDIA
restored.` / `[AI] Switched back to NVIDIA.`.

This was verified end-to-end against real infrastructure, not just read
over: a local mock NVIDIA-compatible endpoint was used to force NVIDIA down
(connection refused) → confirm fallback → confirm the background poll
finds it back up → confirm traffic actually routes to NVIDIA again
(distinguishable mock response, not just a log line). Separately, the
real failover path was exercised against `api.anthropic.com` directly
(reachable; NVIDIA's domain wasn't, which is itself a realistic "provider
down" scenario) to confirm the request-building code produces a
request Anthropic's server accepts and rejects only on the (deliberately
invalid) API key — i.e., the wire format is correct.

**Capabilities without a provider yet** (`image`, `vision`, `video`,
`audio`, `speech`, `embeddings`, `moderation`) are typed, real functions
that throw `AICapabilityNotImplementedError` — not commented-out code. Each
file's docstring says exactly what plugging in a provider would look like.

## What's fully implemented

- **Auth** (§4): signup/login, 15-min JWT access tokens, rotating refresh
  tokens with theft detection (replaying a revoked token revokes the whole
  rotation family), logout / logout-all.
- **Goals + roadmap + progress** (§6): full CRUD, and — critically — a single
  `advanceGoal` function (`src/lib/progress.ts`, ported from the frontend's
  `useAppStore.ts`) that both `focus_session` and `planner_chat` progress
  sources call, so they can't silently diverge. Handles the full cascade:
  task done → milestone done → next milestone promoted → goal completed.
- **Streaks**: same day-gap logic as the frontend store (consecutive day
  +1, gap resets to 1, same-day is a no-op), plus a display-only decay check
  so a stale streak shows 0 without needing a cron job.
- **AI Planner** (§8): intake questions, roadmap generation, and chat replies
  go through `ai.planner` (`src/services/ai/capabilities/planner.ts`) using
  server-side tool use (`submit_roadmap`, `mark_task_done`) routed through
  NVIDIA→Anthropic per the AI service architecture above, and fall back to
  the deterministic engines ported from the frontend's `generateRoadmap.ts`
  / `plannerEngine.ts` if both providers fail — so a total AI outage never
  blocks goal creation or chat.
- **Progress summaries**: `ai.summarize.summarizeProgress` turns a long raw
  progress note into a short first-person summary for the activity log,
  with the same fall-back-to-truncation safety net.
- **Activity log, notifications, settings, connections, push tokens, sync**
  (§6/§9/§11/§12): all implemented with cursor-based pagination where the
  spec calls for it.
- **Build in Public** (§10) — two flows:
  - The original activity-card share (`POST /build-in-public`): a quick
    Twitter/LinkedIn blurb + rendered card image from one activity entry,
    now generated by `ai.content` instead of a fixed template.
  - Multi-platform/multi-format generation (`POST /build-in-public/generate`
    + `GET/PATCH/DELETE /build-in-public/generated[/:id]`): threads, founder
    updates, weekly summaries, milestone announcements, long-form articles,
    and technical blog posts, across Twitter/LinkedIn/Medium/Dev.to/blog.
    Platform and format both just steer prompt construction
    (`src/services/ai/capabilities/content.ts`) — adding a new platform or
    format later is a data change, not new code. Fully editable after
    generation, per spec.
  - Card images: the frontend's client-side `<canvas>` renderer
    (`downloadCard.ts`) ported pixel-for-pixel to `@napi-rs/canvas`
    server-side, since RN has no DOM canvas. Verified output against the
    original — same 1200×630 layout, gradient, glow, and type.
- **Idempotency-Key** (§3): generic middleware, any POST/PATCH route can opt
  in by reading the header; response is cached 24h and replayed on retry.
- **Swagger / OpenAPI**: full spec at `src/docs/openapi.yaml`, live UI at
  `/docs`, raw spec at `/openapi.yaml` and `/openapi.json`.
- **WebSocket hub** (§9): `/v1/ws?token=...` — cross-device `invalidate` and
  live `notification` pushes. Planner token-streaming isn't wired in yet
  (see below).

## What's stubbed (needs real credentials/infra to finish)

These all have a clear seam and a comment at the call site — nothing is
silently fake:

- **OAuth** (`/auth/oauth/:provider/*`, `/me/connections`): **fully
  implemented** for any provider whose client id/secret env vars are set
  (`src/lib/oauth.ts` + the callback routes in `src/routes/auth.ts`).
  Google is pre-configured; GitHub and Figma have their endpoint config
  ready and just need `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` or
  `FIGMA_CLIENT_ID`/`FIGMA_CLIENT_SECRET` set to switch on. Handles both
  "login with provider" (find-or-create a user by email) and "connect
  provider" (an already-logged-in user linking a new one from Settings) via
  a signed-in-or-not check on `/start`, tracks CSRF state server-side with a
  10-minute TTL, and hands the web client its token pair back in a URL
  fragment at `${FRONTEND_URL}/oauth-callback#accessToken=...` so tokens
  never land in server logs. Leave a provider's env vars unset to keep it
  returning `501` instead of erroring on a missing client id.
- **Email** (password reset, email verification, data export delivery):
  the endpoints exist and behave correctly (204s, no email-enumeration
  leaks) but don't actually send mail — no provider is configured.
- **Push notifications**: `sendNotification()` (`src/lib/notify.ts`) always
  writes to the DB and pushes live over the WebSocket if a session is
  open; the Web Push / FCM fan-out is logged, not sent, until VAPID keys /
  an FCM service account are added.
- **Card image storage**: PNGs are written to local disk and served from
  `/static/cards` (`src/lib/storage.ts`). Swap `uploadPng()` for an S3/R2
  `PutObjectCommand` call when you have a bucket — the route code doesn't
  change.
- **Data export job**: `POST /me/export` returns `202 queued` but there's no
  actual job queue wired up (no BullMQ/Redis configured).
- **Planner streaming**: chat replies are non-streaming REST today, per the
  spec's suggested build order ("ship non-streaming first"). The WS hub is
  in place to add `planner_token` / `planner_done` events later.

## Project layout

```
src/
  db/schema.ts          Drizzle schema — 15 tables (§5 + generated_posts)
  db/client.ts           pg Pool + drizzle()
  db/migrate.ts           migration runner (npm run db:migrate)
  lib/tokens.ts           JWT + refresh token hashing
  lib/progress.ts         advanceGoal + streak logic (ported from frontend)
  lib/generateRoadmap.ts  deterministic roadmap templates (ported)
  lib/plannerEngine.ts    deterministic intake + chat replies (ported)
  lib/renderCard.ts       @napi-rs/canvas build-in-public card renderer
  lib/storage.ts          card image upload (local disk; swap for S3/R2)
  lib/notify.ts           sendNotification() — DB write + WS + push fan-out
  lib/errors.ts           ApiError + error-handling middleware
  lib/logger.ts           small leveled logger used by the AI service
  services/ai/index.ts             the `ai` façade — the only import point
  services/ai/router.ts             NVIDIA→Anthropic routing + recovery
  services/ai/types.ts               provider-agnostic request/response types
  services/ai/providers/provider.ts   the AIProvider interface
  services/ai/providers/nvidia.ts      NVIDIA NIM (OpenAI-compatible)
  services/ai/providers/anthropic.ts    Anthropic Messages API
  services/ai/capabilities/*.ts    chat, reasoning, planner, content,
                                    summarize, reflection, + placeholders
                                    (image, vision, video, audio, speech,
                                    embeddings, moderation)
  middleware/auth.ts       requireAuth, getUserId
  middleware/idempotency.ts
  routes/*.ts             one file per resource, matches openapi.yaml 1:1
  ws/hub.ts                WebSocket connection registry + broadcast helpers
  docs/openapi.yaml         the spec
  docs/docs-route.ts         mounts Swagger UI at /docs
  server.ts                 wires it all together
drizzle/                  generated SQL migrations
```

## Notes on running this yourself

- Postgres: any Postgres 14+ works. Local dev was tested against Postgres 16.
- `npm run build && npm start` for production; remember to also copy
  `src/docs/openapi.yaml` into `dist/docs/` as part of your build step (tsc
  doesn't copy non-`.ts` files) — or point `docs-route.ts` at the `src`
  path directly if running via `tsx`/`ts-node` in production.
- Rate limiting is a single global floor (300 req/min/IP) in `server.ts`;
  tighten further on `/auth/login` and `/auth/signup` specifically if this
  goes past hackathon-demo traffic.
- AI service: leave `NVIDIA_API_KEY`/`ANTHROPIC_API_KEY` both unset in dev
  to run entirely on the deterministic fallback engines (fast, free, no
  network calls). Set one or both to exercise the real routing.
