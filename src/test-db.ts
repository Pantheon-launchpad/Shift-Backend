import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    const now = await sql`SELECT NOW()`;
    console.log("Railway Postgres connected:", now);
  } catch (err) {
    console.error("Database connection failed:", err);
  }
})();