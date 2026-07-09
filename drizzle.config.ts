import "dotenv/config";
import type { Config } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL!;
const isLocalDb = /localhost|127\.0\.0\.1/.test(connectionString);
const sslDisabled = process.env.DATABASE_SSL === "false";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: isLocalDb || sslDisabled ? undefined : { rejectUnauthorized: false },
  },
} satisfies Config;
