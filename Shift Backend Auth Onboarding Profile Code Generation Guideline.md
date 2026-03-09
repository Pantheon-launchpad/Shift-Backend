

## **Guideline for AI Code Generation – Shift Backend (Auth, Onboarding, Profile) + Swagger Documentation**

### **Project Overview**
You are building the backend for **Shift** – a productivity app that enforces focus through public accountability and technical lockdowns. Your task is to implement the **authentication**, **onboarding**, and **profile** features. The stack:
- **Runtime:** Bun
- **Framework:** ElysiaJS (with Eden for end-to-end type safety)
- **Database:** PostgreSQL (use Drizzle ORM for type-safe queries)
- **Caching/Queues:** Upstash Redis (for streak logic and alarms)
- **Documentation:** Swagger (OpenAPI) via `@elysiajs/swagger`

The frontend (mobile/web) will consume these APIs. Ensure all endpoints are RESTful, secure, and follow the specifications below.

---

### **Project Structure**
```
src/
├── db/
│   ├── schema/          # Drizzle table definitions
│   ├── migrations/      # SQL migration files
│   └── client.ts        # Drizzle client setup
├── auth/
│   ├── routes.ts        # Auth endpoints
│   ├── service.ts       # Business logic (register, login, OAuth)
│   └── middleware.ts    # JWT verification
├── onboarding/
│   ├── routes.ts
│   └── service.ts
├── profile/
│   ├── routes.ts
│   └── service.ts
├── utils/
│   ├── redis.ts         # Upstash Redis client
│   ├── errors.ts        # Custom error classes
│   └── logger.ts        # Logging
├── types/
│   └── index.ts         # Shared TypeScript types
├── docs/
│   └── swagger.ts       # Swagger configuration (optional, can be in index.ts)
└── index.ts             # Main Elysia app
```

---

### **Swagger Documentation Setup**
1. **Install `@elysiajs/swagger`**:
   ```bash
   bun add @elysiajs/swagger
   ```

2. **Configure Swagger in the main app** (`index.ts`):
   ```typescript
   import { swagger } from '@elysiajs/swagger'
   import { Elysia } from 'elysia'

   const app = new Elysia()
     .use(
       swagger({
         path: '/docs',           // Swagger UI will be available at /docs
         documentation: {
           info: {
             title: 'Shift API',
             version: '1.0.0',
             description: 'API for Shift – The Mandatory Contract for Execution'
           },
           tags: [
             { name: 'Auth', description: 'Authentication endpoints' },
             { name: 'Onboarding', description: 'User onboarding flow' },
             { name: 'Profile', description: 'User profile and settings' }
           ]
         }
       })
     )
     // ... other plugins and routes
   ```

3. **Document each endpoint** using Elysia's schema and the Swagger plugin's capabilities:
   - Use `t` from `@elysiajs/validator` to define request/response schemas; these are automatically picked up by Swagger.
   - Add `detail` property to routes to provide summary, description, tags, etc.
   - For protected routes, document the required Bearer token.

   Example:
   ```typescript
   import { t } from 'elysia'

   app.post('/auth/register', ({ body }) => ..., {
     body: t.Object({
       email: t.String({ format: 'email' }),
       password: t.String({ minLength: 6 }),
       name: t.String()
     }),
     response: t.Object({
       user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
       accessToken: t.String(),
       refreshToken: t.String()
     }),
     detail: {
       summary: 'Register a new user',
       description: 'Creates a user account with email and password.',
       tags: ['Auth']
     }
   })
   ```

4. **Ensure Swagger UI is accessible** at `/docs` (or your chosen path) and displays all endpoints with proper schemas.

---

### **Database Schema (PostgreSQL with Drizzle ORM)**
Create the following tables. Use `uuid` for primary keys, timestamps with `now()`.

#### **1. `users`**
| Column         | Type      | Description                        |
|----------------|-----------|------------------------------------|
| id             | uuid (PK) | Default `gen_random_uuid()`        |
| email          | text      | Unique, not null                   |
| password_hash  | text      | Nullable (null for OAuth users)    |
| name           | text      |                                    |
| avatar_url     | text      |                                    |
| auth_provider  | text      | 'email', 'google', 'apple'         |
| provider_id    | text      | ID from OAuth provider              |
| created_at     | timestamp | Default now()                       |
| updated_at     | timestamp | Auto-update                         |
| last_login     | timestamp |                                    |
| is_onboarded   | boolean   | Default false                       |

#### **2. `user_profiles`**
| Column               | Type      | Description                              |
|----------------------|-----------|------------------------------------------|
| id                   | uuid (PK) |                                          |
| user_id              | uuid      | References users.id (unique)             |
| username             | text      | Unique, used for public URL              |
| display_name         | text      |                                          |
| bio                  | text      |                                          |
| profile_visibility   | text      | 'public', 'friends', 'private'           |
| streak_sharing_opt_in| boolean   | Default true                             |
| created_at           | timestamp |                                          |
| updated_at           | timestamp |                                          |

#### **3. `onboarding_responses`**
| Column                  | Type      | Description                                      |
|-------------------------|-----------|--------------------------------------------------|
| id                      | uuid (PK) |                                                  |
| user_id                 | uuid      | References users.id (unique)                     |
| objective_type          | text      | 'startup', 'learning', 'content', 'habits'       |
| lockdown_intensity      | text      | 'soft', 'standard', 'hard', 'absolute'           |
| preferred_focus_time    | text      | 'morning', 'afternoon', 'night', 'flexible'      |
| social_accountability   | text      | 'public', 'friends', 'private'                   |
| current_objective_text  | text      | Free text from "What's your current objective?"  |
| created_at              | timestamp |                                                  |

#### **4. `user_settings`** (JSON for flexibility, but we can define columns)
| Column                      | Type      | Description                                   |
|-----------------------------|-----------|-----------------------------------------------|
| id                          | uuid (PK) |                                               |
| user_id                     | uuid      | References users.id (unique)                  |
| lockdown_default_intensity  | text      | Default for sessions                          |
| adaptive_triggers_enabled   | boolean   |                                               |
| behavior_detection_settings | jsonb     | e.g., { adult: true, social: false, ... }    |
| ai_coaching_style           | text      | 'strict', 'supportive', 'adaptive'            |
| schedule_awareness          | jsonb     | work hours                                    |
| integrations                | jsonb     | GitHub, Notion, Spotify tokens, etc.          |
| privacy                     | jsonb     | Additional privacy flags                      |
| created_at                  | timestamp |                                               |
| updated_at                  | timestamp |                                               |

#### **5. `streaks`**
| Column                   | Type      | Description                                   |
|--------------------------|-----------|-----------------------------------------------|
| id                       | uuid (PK) |                                               |
| user_id                  | uuid      | References users.id (unique)                  |
| current_streak_days      | integer   | Default 0                                     |
| longest_streak           | integer   | Default 0                                     |
| last_session_date        | date      | Last day a focus session was completed        |
| total_focus_hours        | float     |                                               |
| consecutive_days_completed| integer  | Alias for current_streak_days                 |
| streak_heatmap_data      | jsonb     | Store daily completion status (for GitHub-style graph) |
| focus_score              | float     | ML prediction (can be null)                   |
| commitment_score         | float     |                                               |
| updated_at               | timestamp |                                               |

#### **6. `focus_sessions`** (for history)
| Column            | Type      | Description                            |
|-------------------|-----------|----------------------------------------|
| id                | uuid (PK) |                                        |
| user_id           | uuid      | References users.id                    |
| task_description  | text      |                                        |
| ai_enhanced_task  | text      | GPT-4 enhanced version                 |
| start_time        | timestamp |                                        |
| end_time          | timestamp |                                        |
| duration_minutes  | integer   |                                        |
| interruptions_count| integer  |                                        |
| completed         | boolean   |                                        |
| created_at        | timestamp |                                        |

#### **7. `subscriptions`**
| Column         | Type      | Description                                |
|----------------|-----------|--------------------------------------------|
| id             | uuid (PK) |                                            |
| user_id        | uuid      | References users.id (unique per active)    |
| tier           | text      | 'starter', 'pro', 'creator', 'teams'       |
| start_date     | timestamp |                                            |
| end_date       | timestamp |                                            |
| payment_provider| text     | 'stripe', 'revenuecat'                     |
| is_active      | boolean   |                                            |
| created_at     | timestamp |                                            |

#### **8. `purchases`** (for add-ons like streak failsafe)
| Column         | Type      | Description                                |
|----------------|-----------|--------------------------------------------|
| id             | uuid (PK) |                                            |
| user_id        | uuid      | References users.id                        |
| item_type      | text      | 'streak_failsafe', 'hard_lockdown', etc.   |
| purchase_date  | timestamp |                                            |
| expires_at     | timestamp | (if applicable)                            |
| created_at     | timestamp |                                            |

---

### **Environment Variables**
Create a `.env` file with:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/shift
REDIS_URL=redis://default:pass@your-upstash-redis-url:6379
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=another-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APPLE_CLIENT_ID=...
APPLE_TEAM_ID=...
APPLE_KEY_ID=...
APPLE_PRIVATE_KEY=...
FRONTEND_URL=http://localhost:3000
```

---

### **Authentication Endpoints** (`/auth`)
All endpoints return JSON. Use JWT for access tokens (short-lived) and refresh tokens (stored in HTTP-only cookie or returned).

- **POST `/auth/register`**  
  Body: `{ email, password, name }`  
  Response: `{ user: { id, email, name }, accessToken, refreshToken }`  
  **Swagger:** Tag `Auth`, summary "Register a new user".

- **POST `/auth/login`**  
  Body: `{ email, password }`  
  Response: same as register.

- **POST `/auth/oauth/google`** (or use redirect flow)  
  If using redirect, implement `/auth/oauth/google/callback`.  
  Return user and tokens.

- **POST `/auth/oauth/apple`** similarly.

- **POST `/auth/logout`** (invalidate refresh token)

- **POST `/auth/refresh`**  
  Body: `{ refreshToken }` or read from cookie.  
  Return new access token.

- **POST `/auth/password-reset/request`**  
  Body: `{ email }`  
  Send reset email (mock or integrate email service).

- **POST `/auth/password-reset/confirm`**  
  Body: `{ token, newPassword }`  
  Update password.

**Authentication Middleware:**  
Create `authMiddleware` that verifies JWT and attaches `user` to context. Document that protected endpoints require `Authorization: Bearer <token>`.

---

### **Onboarding Endpoints** (`/onboarding`)
All endpoints require authentication (JWT). Add tag `Onboarding`.

- **GET `/onboarding/status`**  
  Returns `{ isOnboarded: boolean }`

- **POST `/onboarding/questionnaire`**  
  Body: `{ objectiveType, lockdownIntensity, preferredFocusTime, socialAccountability }`  
  Save to `onboarding_responses`. Return saved data.

- **POST `/onboarding/goal`**  
  Body: `{ currentObjectiveText }`  
  Update the same `onboarding_responses` record.

- **POST `/onboarding/task`** (optional – first task)  
  Body: `{ taskDescription, isAIPlanned: boolean }`  
  If `isAIPlanned`, you can simulate AI enhancement (e.g., prepend "Shipped ") and store in `focus_sessions` as first session? Possibly just store for later use. For simplicity, you can create a placeholder focus session with `completed=false`.

- **POST `/onboarding/complete`**  
  Mark `users.is_onboarded = true`.  
  Optionally create initial `streaks` record and default `user_settings`.

---

### **Profile Endpoints** (`/profile`)
Tag `Profile`.

- **GET `/profile/:username`** (public)  
  Returns public profile: `{ username, displayName, bio, avatarUrl, streak: { current, longest }, totalFocusHours, recentSessions? }`  
  Respect profile visibility settings.  
  **Swagger:** Add parameter `username` in path.

- **GET `/profile/me`** (auth)  
  Returns full user profile including:  
  `user`, `profile`, `onboarding`, `settings`, `streak`, `subscription`, `purchases`.

- **PUT `/profile/me`** (auth)  
  Body: `{ displayName, bio, avatarUrl? }`  
  Update `user_profiles`.

- **PUT `/profile/settings`** (auth)  
  Body: partial `user_settings` (e.g., `{ lockdownDefaultIntensity, adaptiveTriggersEnabled, ... }`)  
  Update settings.

- **GET `/profile/stats`** (auth)  
  Returns `focusScore`, `commitmentScore`, `totalFocusHours`, etc.

- **GET `/profile/streak`** (auth)  
  Returns detailed streak: `current`, `longest`, `lastSessionDate`, `heatmap` (array of daily data).

- **GET `/profile/sessions`** (auth, paginated)  
  Query: `?page=1&limit=20`  
  Returns list of focus sessions.

- **GET `/profile/heatmap`** (auth)  
  Returns data for GitHub-style contribution graph (e.g., array of `{ date, count }` for last year).

- **POST `/profile/avatar`** (auth, multipart/form-data)  
  Upload avatar, store in cloud (e.g., Supabase Storage or S3), return URL.

---

### **Redis Integration (Upstash)**
Use Redis for:
- **Streak updates:** When a focus session completes, increment streak and update last session date atomically.
- **Alarms:** Schedule morning trigger alarms (e.g., using Redis sorted sets with timestamps). For simplicity, you can just store user's alarm time and let a cron job check every minute.

Implement a Redis utility:
```typescript
// utils/redis.ts
import { Redis } from '@upstash/redis'
export const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN })
```

**Streak logic example:**  
When a session completes (call `POST /sessions/complete` – not in scope but will be used by frontend), update the user's streak in Redis first, then persist to DB. Use Redis to prevent race conditions.

For alarms: store user's preferred alarm time and use a cron job to fetch all users whose alarm time is due and trigger notifications (via push, not in backend scope – but you can just log).

---

### **Error Handling**
Use Elysia's built-in error handling. Define custom errors in `utils/errors.ts`:
- `UnauthorizedError`
- `ForbiddenError`
- `NotFoundError`
- `ValidationError`
- `ConflictError`

Return consistent error JSON: `{ error: { code, message } }`  
Swagger will automatically document error responses if you define them in route schemas.

---

### **Validation**
Use Elysia's validation with `t` from `@elysiajs/validator`. This also feeds into Swagger schemas. For example:
```typescript
import { t } from 'elysia'

app.post('/auth/register', ({ body }) => ..., {
  body: t.Object({
    email: t.String({ format: 'email' }),
    password: t.String({ minLength: 6 }),
    name: t.String()
  }),
  response: t.Object({
    user: t.Object({ id: t.String(), email: t.String(), name: t.String() }),
    accessToken: t.String(),
    refreshToken: t.String()
  }),
  detail: { summary: 'Register', tags: ['Auth'] }
})
```

---

### **Type Safety with Eden**
Ensure all endpoint responses are typed so the frontend can infer types using Eden. Export the app type.

---

### **Additional Considerations**
- **Password hashing:** Use `bcrypt` or `Bun.password`.
- **JWT:** Use `@elysiajs/jwt` plugin.
- **CORS:** Configure for frontend URL.
- **Rate limiting:** Implement on auth endpoints.
- **Logging:** Use `pino` or `bunyan`.

---

### **What to Generate**
The AI should output:
1. Full source code following the structure above.
2. Drizzle schema files (`db/schema/*.ts`).
3. Migration SQL files (or use Drizzle Kit migrations).
4. All route files with complete logic, including Swagger documentation for each endpoint.
5. Utility functions for Redis, errors, etc.
6. A sample `.env.example`.
7. A `README.md` with setup instructions, including how to access Swagger docs at `/docs`.

The code must be production-ready, well-commented, and follow TypeScript best practices.

---

### **Final Notes**
- Do not implement features outside auth, onboarding, and profile unless necessary for these endpoints (e.g., focus sessions are needed for profile stats).
- Assume AI enhancement is mocked (e.g., prepend "Shipped " to task description) – no actual OpenAI call needed.
- For OAuth, implement only the callback handling; you can mock the redirect flow.
- Swagger must be installed and configured correctly. Ensure the Swagger UI is functional and displays all endpoints with proper schemas.

Now proceed to generate the code according to this guideline.