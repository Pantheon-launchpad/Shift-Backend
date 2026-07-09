import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

function logConnectionTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.log("DATABASE_URL is not set at all.");
    return;
  }
  try {
    const u = new URL(raw);
    console.log(`Connecting to: host=${u.hostname} port=${u.port || "5432"} db=${u.pathname.slice(1)} ssl=${!/localhost|127\.0\.0\.1/.test(u.hostname)}`);
  } catch {
    console.log("DATABASE_URL is set but isn't a valid URL — check for stray quotes or missing postgresql:// prefix.");
  }
}

async function main() {
  logConnectionTarget();
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
