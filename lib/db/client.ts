import postgres, { type Sql } from "postgres";

import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __stacktracker_sql: Sql | undefined;
}

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
