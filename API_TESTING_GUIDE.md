# Shift Backend API Testing Guide

## Starting the Development Server

1. Install dependencies:
   ```bash
   bun install
   ```
2. Copy `.env.example` to `.env` and fill in your environment variables.
3. Run migrations (if needed):

   ```bash
   # If you haven't already, install drizzle-kit globally or as a dev dependency:
   bun add -d drizzle-kit

   # Generate migration SQL from your schema (optional, if you want to use Drizzle's migration system):
   bunx drizzle-kit generate:pg

   # Push migration SQL to your database (if using Drizzle's migration system):
   bunx drizzle-kit push:pg

   # Or, run the provided SQL migration directly (recommended for this project):
   psql "$DATABASE_URL" -f src/db/migrations/001_init.sql
   ```

4. Set up Drizzle ORM in your code:
   - In `src/db/client.ts`, use the following setup for Windows/Bun compatibility:
   ```typescript
   import { drizzle } from "drizzle-orm/postgres-js";
   import postgres from "postgres";
   // ...import your schema files...
   const client = postgres(process.env.DATABASE_URL!);
   export const db = drizzle(client, {
     schema: {
       /* ... */
     },
   });
   ```
5. Start the server:
   ```bash
   bun run index.ts
   ```
   The server will run at http://localhost:3000

---

This guide helps you test the main endpoints for authentication, onboarding, and profile features in the Shift backend. You can use tools like [Hoppscotch](https://hoppscotch.io/), [Postman](https://www.postman.com/), or `curl`.

---

## Base URL

```
http://localhost:3000
```

## Swagger Docs

- Visit [http://localhost:3000/docs](http://localhost:3000/docs) for interactive API documentation and testing.

---

## Authentication Endpoints

### Register

- **POST** `/auth/register`
- **Body:**

```json
{
  "email": "user@example.com",
  "password": "yourpassword",
  "name": "Your Name"
}
```

- **Response:**

```json
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### Login

- **POST** `/auth/login`
- **Body:**

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

- **Response:** Same as register.

---

## Onboarding Endpoints (Require Auth)

- Add header: `Authorization: Bearer <accessToken>`

### Get Onboarding Status

- **GET** `/onboarding/status`
- **Response:** `{ "isOnboarded": false }`

### Submit Questionnaire

- **POST** `/onboarding/questionnaire`
- **Body:**

```json
{
  "objectiveType": "startup",
  "lockdownIntensity": "soft",
  "preferredFocusTime": "morning",
  "socialAccountability": "public"
}
```

### Update Goal

- **POST** `/onboarding/goal`
- **Body:**

```json
{
  "currentObjectiveText": "Ship MVP by April"
}
```

### Complete Onboarding

- **POST** `/onboarding/complete`

---

## Profile Endpoints

### Get Public Profile

- **GET** `/profile/:username`

### Get My Profile (Auth)

- **GET** `/profile/me`

### Update My Profile (Auth)

- **PUT** `/profile/me`
- **Body:**

```json
{
  "displayName": "New Name",
  "bio": "About me...",
  "avatarUrl": "https://..." // optional
}
```

---

## Tips

- Use the Swagger UI for schema details and to try endpoints live.
- For protected endpoints, always include the `Authorization` header with your access token.
- If you get a 401 error, your token may be missing or expired—login again.
- For more endpoints and details, see `/docs`.

---

## Example `curl` Commands

**Register:**

```
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"yourpassword","name":"Your Name"}'
```

**Login:**

```
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"yourpassword"}'
```

**Get My Profile:**

```
curl -X GET http://localhost:3000/profile/me \
  -H "Authorization: Bearer <accessToken>"
```

---

For any issues, check the logs or see the README for setup help.
