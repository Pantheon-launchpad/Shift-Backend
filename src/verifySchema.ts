import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    console.log("🔍 Verifying database schema...\n");

    // Get list of tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log(`✅ Found ${tables.length} tables:\n`);

    const expectedTables = [
      "users",
      "user_profiles",
      "onboarding_responses",
      "user_settings",
      "streaks",
      "focus_sessions",
      "subscriptions",
      "purchases",
    ];

    const actualTables = tables.map((t: any) => t.table_name);

    for (const table of expectedTables) {
      if (actualTables.includes(table)) {
        console.log(`   ✓ ${table}`);
      } else {
        console.log(`   ✗ ${table} - MISSING!`);
      }
    }

    console.log("\n📊 Table Details:\n");

    // Check each table's columns
    for (const table of expectedTables) {
      if (actualTables.includes(table)) {
        const columns = await sql`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = ${table}
          ORDER BY ordinal_position
        `;

        console.log(`\n${table} (${columns.length} columns):`);
        for (const col of columns) {
          const nullable = col.is_nullable === "YES" ? "nullable" : "not null";
          const hasDefault = col.column_default
            ? ` [default: ${col.column_default}]`
            : "";
          console.log(
            `   - ${col.column_name}: ${col.data_type} ${nullable}${hasDefault}`,
          );
        }
      }
    }

    console.log("\n✨ Schema verification completed!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Schema verification failed:", err);
    process.exit(1);
  }
})();
