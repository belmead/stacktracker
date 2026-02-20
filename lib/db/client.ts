import postgres, { type Sql } from "postgres";

import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __stacktracker_sql: Sql | undefined;
}

function parseDatabaseUrlUser(databaseUrl: string): string | null {
  try {
    const parsed = new URL(databaseUrl);
    const decoded = decodeURIComponent(parsed.username ?? "").trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function assertRuntimeDatabaseUser(): void {
  const expectedRuntimeUser = env.DATABASE_RUNTIME_USER?.trim();
  if (!expectedRuntimeUser) {
    return;
  }

  const actualRuntimeUser = parseDatabaseUrlUser(env.DATABASE_URL);
  if (!actualRuntimeUser) {
    throw new Error("DATABASE_RUNTIME_USER is set but DATABASE_URL does not include a runtime user");
  }

  if (actualRuntimeUser !== expectedRuntimeUser) {
    throw new Error(
      `Runtime DB user mismatch: expected ${expectedRuntimeUser}, received ${actualRuntimeUser}. Check DATABASE_URL and DATABASE_RUNTIME_USER.`
    );
  }
}

assertRuntimeDatabaseUser();

const sql = global.__stacktracker_sql ?? postgres(env.DATABASE_URL, {
  max: 5,
  ssl: env.DATABASE_SSL_MODE === "disable" ? false : "require",
  prepare: env.DATABASE_PREPARE === "true",
  transform: postgres.camel
});

if (process.env.NODE_ENV !== "production") {
  global.__stacktracker_sql = sql;
}

export { sql };
