import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const analyticsUrl =
    process.env.ANALYTICS_DATABASE_URL ||
    "postgresql://analytics_user:analytics_password@localhost:5432/analytics_demo";

  console.log("🚀 Setting up Analytics Demo Data Source...");

  // 1. Ensure database exists
  try {
    execSync('psql -d postgres -c "CREATE DATABASE analytics_demo;" 2>/dev/null', {
      stdio: "ignore",
    });
  } catch {
    // Database might already exist
  }

  // 2. Run SQL migration script
  const sqlFilePath = path.join(import.meta.dirname, "setup-analytics-db.sql");
  console.log(`Executing migration script from ${sqlFilePath}...`);
  execSync(`psql -d analytics_demo -f "${sqlFilePath}"`, { stdio: "inherit" });
  console.log("✅ Migration applied successfully.");

  // 3. Verify tables & row counts using psql query
  console.log("\n📊 Verifying Tables, Descriptions, and Row Counts:");
  const verifyQuery = `
    SELECT 
      t.table_name,
      obj_description(('public.' || quote_ident(t.table_name))::regclass, 'pg_class') as table_description
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name;
  `;

  execSync(
    `psql -d analytics_demo -c "${verifyQuery.replace(/\n/g, " ")}"`,
    { stdio: "inherit" }
  );

  console.log("\nRow Counts:");
  execSync(
    `psql "${analyticsUrl}" -c "SELECT 'customers' as table_name, count(*) FROM customers UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'orders', count(*) FROM orders;"`,
    { stdio: "inherit" }
  );

  console.log("\n✨ Analytics Data Source setup complete!");
  console.log(`🔗 Connection URI: ${analyticsUrl}`);
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
