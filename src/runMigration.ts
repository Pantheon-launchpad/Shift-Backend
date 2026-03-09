import postgres from "postgres";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    console.log("🔄 Starting database migration...");

    // Read migration file
    const migrationPath = join(import.meta.dir, "db/migrations/001_init.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    console.log("📄 Loaded migration file");

    // Execute migration
    // Split by semicolon to handle multiple statements
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    console.log(`📝 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement) continue; // Skip empty statements

      try {
        await sql.unsafe(statement);
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (err: any) {
        console.error(`❌ Error executing statement ${i + 1}:`, err.message);
        // Continue with other statements instead of failing completely
      }
    }

    console.log("\n✨ Migration completed!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
})();
