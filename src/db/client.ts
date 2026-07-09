import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
const isLocalDb = !!connectionString && /localhost|127\.0\.0\.1/.test(connectionString);

// Managed Postgres (Render, RDS, Supabase, etc.) requires SSL and presents
// a cert not in Node's default CA bundle — `rejectUnauthorized: false`
// still gets you an encrypted connection, just without validating the CA
// chain, which is the standard tradeoff for these providers' free/hobby
// tiers. Local dev Postgres has no SSL listener at all, so skip it there.
// Set DATABASE_SSL=false to force it off (e.g. a self-hosted box with its
// own real cert setup you want strictly validated instead).
const sslDisabled = process.env.DATABASE_SSL === "false";

export const pool = new Pool({
  connectionString,
  ssl: isLocalDb || sslDisabled ? undefined : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
