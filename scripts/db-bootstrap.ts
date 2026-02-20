import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveDatabaseUrl(): string {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (adminUrl) {
    return adminUrl;
  }

  return required("DATABASE_URL");
}

function sslMode(): "require" | false {
  return process.env.DATABASE_SSL_MODE === "disable" ? false : "require";
}

function prepareMode(): boolean {
  return process.env.DATABASE_PREPARE === "true";
}

function shouldResetSchema(): boolean {
  const value = process.env.DB_BOOTSTRAP_RESET;
  return value === "true" || value === "1";
}

const APP_TABLES = [
  "vendor_pages",
  "offers_current",
  "offer_history",
  "finnrick_ratings",
  "finnrick_rating_history",
  "compound_category_map",
  "featured_compounds",
  "scrape_events",
  "scrape_requests",
  "ai_agent_tasks",
  "review_queue",
  "admin_magic_links",
  "admin_sessions",
  "admin_audit_log",
  "compound_aliases",
  "compound_variants",
  "categories",
  "compounds",
  "formulations",
  "scrape_runs",
  "vendors",
  "app_settings"
] as const;

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

async function resetAppTables(sql: postgres.Sql): Promise<void> {
  console.log("Reset flag detected. Dropping existing app tables...");

  for (const table of APP_TABLES) {
    await sql.unsafe(`drop table if exists ${quoteIdent(table)} cascade`);
  }
}

async function runSqlFile(sql: postgres.Sql, filePath: string): Promise<void> {
  const sqlText = await readFile(filePath, "utf8");
  // Uses unsafe on local bootstrap SQL files that are committed in-repo.
  await sql.unsafe(sqlText);
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: sslMode(),
    prepare: prepareMode()
  });

  const root = process.cwd();
  const schemaPath = path.join(root, "sql", "schema.sql");
  const seedPath = path.join(root, "sql", "seed.sql");

  try {
    if (shouldResetSchema()) {
      await resetAppTables(sql);
    }

    console.log("Applying schema...");
    await runSqlFile(sql, schemaPath);

    console.log("Applying seed...");
    await runSqlFile(sql, seedPath);

    console.log("Database bootstrap complete.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
