import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  DEMO_MODE: z.enum(["true", "false"]).optional().default("false"),
  DEFAULT_TENANT_SLUG: z.string().default("default"),
  YELP_ADS_BASE_URL: z.string().url().default("https://partner-api.yelp.com"),
  YELP_FEATURES_BASE_URL: z.string().url().default("https://partner-api.yelp.com"),
  YELP_REPORTING_BASE_URL: z.string().url().default("https://api.yelp.com"),
  YELP_BUSINESS_MATCH_BASE_URL: z.string().url().default("https://partner-api.yelp.com"),
  YELP_DATA_INGESTION_BASE_URL: z.string().url().default("https://partner-api.yelp.com"),
  YELP_CLIENT_ID: z.string().optional(),
  YELP_CLIENT_SECRET: z.string().optional(),
  YELP_API_KEY: z.string().optional(),
  YELP_REDIRECT_URI: z.string().url().optional(),
  YELP_ALLOWED_BUSINESS_IDS: z.string().optional()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

function getSecret(name: "SESSION_SECRET" | "APP_ENCRYPTION_KEY", provided: string | undefined, nodeEnv: ServerEnv["NODE_ENV"]) {
  if (provided) {
    return provided;
  }

  if (nodeEnv === "production") {
    throw new Error(`${name} must be configured in production.`);
  }

  return `${name.toLowerCase()}-development-placeholder-change-me`;
}

export function getServerEnv(): ServerEnv & { SESSION_SECRET: string; APP_ENCRYPTION_KEY: string } {
  if (cachedEnv) {
    return cachedEnv as ServerEnv & { SESSION_SECRET: string; APP_ENCRYPTION_KEY: string };
  }

  const parsed = serverEnvSchema.parse(process.env);
  cachedEnv = {
    ...parsed,
    SESSION_SECRET: getSecret("SESSION_SECRET", parsed.SESSION_SECRET, parsed.NODE_ENV),
    APP_ENCRYPTION_KEY: getSecret("APP_ENCRYPTION_KEY", parsed.APP_ENCRYPTION_KEY, parsed.NODE_ENV)
  };

  return cachedEnv as ServerEnv & { SESSION_SECRET: string; APP_ENCRYPTION_KEY: string };
}

export function isDemoMode() {
  return getServerEnv().DEMO_MODE === "true";
}
