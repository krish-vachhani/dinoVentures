import "dotenv/config";
import { z } from "zod";

/**
 * All runtime configuration, validated once at startup. The process refuses to
 * boot with a missing or unsafe setting rather than failing on first use.
 */
const booleanFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  MOCK_PAYMENT_WEBHOOK_SECRET: z.string().min(16, "MOCK_PAYMENT_WEBHOOK_SECRET must be at least 16 characters"),
  // Lets users settle mock payments from the UI. Allowed in every environment
  // for now (no real gateway exists), but it must be switched on explicitly.
  MOCK_PAYMENT_SIMULATION: booleanFromEnv,
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  // Only set when a reverse proxy sits in front of the API. Trusting
  // X-Forwarded-For without one would let clients spoof their IP and dodge
  // the login rate limit.
  TRUST_PROXY: booleanFromEnv,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}`);
  }

  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    port: env.PORT,
    database: {
      url: env.DATABASE_URL,
      poolSize: env.DATABASE_POOL_SIZE,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtTtlSeconds: env.JWT_TTL_SECONDS,
      bcryptRounds: env.BCRYPT_ROUNDS,
      cookieName: "cv_session",
    },
    payments: {
      webhookSecret: env.MOCK_PAYMENT_WEBHOOK_SECRET,
      simulationEnabled: env.MOCK_PAYMENT_SIMULATION,
    },
    clientOrigin: env.CLIENT_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
  } as const;
}

export const config = loadConfig();
export type AppConfig = typeof config;
