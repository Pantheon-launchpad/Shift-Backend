# Shift Backend

Backend for Shift – a productivity app enforcing focus through public accountability and technical lockdowns.

## Features

- Authentication (email/password, Google, Apple)
- Onboarding flow
- User profile and settings
- Streaks, focus sessions, subscriptions, purchases
- Swagger (OpenAPI) documentation at `/docs`
- Type-safe with Drizzle ORM and Eden
- Upstash Redis for streaks/alarms

## Stack

- **Runtime:** Bun
- **Framework:** ElysiaJS (+ Eden)
- **DB:** PostgreSQL (Drizzle ORM)
- **Cache:** Upstash Redis
- **Docs:** Swagger via `@elysiajs/swagger`

## Setup

1. **Clone repo & install deps:**
   ```bash
   bun install
   bun add @elysiajs/swagger @elysiajs/jwt @elysiajs/validator drizzle-orm drizzle-kit pg @upstash/redis pino
   ```
2. **Configure environment:**
   - Copy `.env.example` to `.env` and fill in values.
3. **Run migrations:**
   ```bash
   bunx drizzle-kit generate:pg
   bunx drizzle-kit push:pg
   ```
4. **Start server:**
   ```bash
   bun run index.ts
   ```
5. **Access Swagger docs:**
   - Visit [http://localhost:3000/docs](http://localhost:3000/docs)

## Project Structure

```
src/
  db/
    schema/           # Drizzle table definitions
    migrations/       # SQL migration files
    client.ts         # Drizzle client setup
  auth/
    routes.ts         # Auth endpoints
    service.ts        # Business logic
    middleware.ts     # JWT verification
  onboarding/
    routes.ts
    service.ts
  profile/
    routes.ts
    service.ts
  utils/
    redis.ts          # Upstash Redis client
    errors.ts         # Custom error classes
    logger.ts         # Logging
  types/
    index.ts          # Shared TypeScript types
  docs/
    swagger.ts        # Swagger config (optional)
  index.ts            # Main Elysia app
```

## Notes

- All endpoints are RESTful, secure, and documented.
- Use Eden for type-safe frontend consumption.
- See `/docs` for full API reference.
