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

function sslMode(): "require" | false {
  return process.env.DATABASE_SSL_MODE === "disable" ? false : "require";
}

function prepareMode(): boolean {
  return process.env.DATABASE_PREPARE === "true";
}

async function runSqlFile(sql: postgres.Sql, filePath: string): Promise<void> {
  const sqlText = await readFile(filePath, "utf8");
  // Uses unsafe on local bootstrap SQL files that are committed in-repo.
  await sql.unsafe(sqlText);
}

async function main(): Promise<void> {
  const databaseUrl = required("DATABASE_URL");

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: sslMode(),
    prepare: prepareMode()
  });

  const root = process.cwd();
  const schemaPath = path.join(root, "sql", "schema.sql");
  const seedPath = path.join(root, "sql", "seed.sql");

  try {
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
