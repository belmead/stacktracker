import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.enum(["require", "disable"]).default("require"),
  DATABASE_PREPARE: z.enum(["true", "false"]).default("false"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_SESSION_COOKIE: z.string().default("st_admin_session"),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
  ADMIN_MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(20),
  ADMIN_AUTH_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().email().optional(),
  ALERT_TO_EMAIL: z.string().email().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  FIRECRAWL_API_KEY: z.string().optional(),
  FIRECRAWL_API_BASE_URL: z.string().url().default("https://api.firecrawl.dev/v2"),
  SCRAPER_USER_AGENT: z
    .string()
    .default("StackTrackerBot/1.0 (+https://stacktracker.com)"),
  FINNRICK_VENDORS_URL: z.string().url().default("https://www.finnrick.com/vendors"),
  VENDOR_SCRAPE_CONCURRENCY: z.coerce.number().int().positive().max(3).default(2),
  SCRAPE_RUN_STALE_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  SCRAPE_RUN_HEARTBEAT_SECONDS: z.coerce.number().int().positive().default(20),
  SCRAPE_RUN_LAG_ALERT_SECONDS: z.coerce.number().int().positive().default(120),
  REVIEW_QUEUE_RETENTION_DAYS: z.coerce.number().int().positive().default(45),
  NON_TRACKABLE_ALIAS_RETENTION_DAYS: z.coerce.number().int().positive().default(120)
});

export const env = envSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SSL_MODE: process.env.DATABASE_SSL_MODE,
  DATABASE_PREPARE: process.env.DATABASE_PREPARE,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_SESSION_COOKIE: process.env.ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_HOURS: process.env.ADMIN_SESSION_TTL_HOURS,
  ADMIN_MAGIC_LINK_TTL_MINUTES: process.env.ADMIN_MAGIC_LINK_TTL_MINUTES,
  ADMIN_AUTH_SECRET: process.env.ADMIN_AUTH_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL,
  ALERT_TO_EMAIL: process.env.ALERT_TO_EMAIL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
  FIRECRAWL_API_BASE_URL: process.env.FIRECRAWL_API_BASE_URL,
  SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT,
  FINNRICK_VENDORS_URL: process.env.FINNRICK_VENDORS_URL,
  VENDOR_SCRAPE_CONCURRENCY: process.env.VENDOR_SCRAPE_CONCURRENCY,
  SCRAPE_RUN_STALE_TTL_MINUTES: process.env.SCRAPE_RUN_STALE_TTL_MINUTES,
  SCRAPE_RUN_HEARTBEAT_SECONDS: process.env.SCRAPE_RUN_HEARTBEAT_SECONDS,
  SCRAPE_RUN_LAG_ALERT_SECONDS: process.env.SCRAPE_RUN_LAG_ALERT_SECONDS,
  REVIEW_QUEUE_RETENTION_DAYS: process.env.REVIEW_QUEUE_RETENTION_DAYS,
  NON_TRACKABLE_ALIAS_RETENTION_DAYS: process.env.NON_TRACKABLE_ALIAS_RETENTION_DAYS
});
