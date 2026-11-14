import { z } from "zod";

// Every host, URL and secret comes from the environment (see .env.example). Nothing is hardcoded.
// Read lazily so `next build` does not require runtime secrets.

const hostLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_DOMAIN: z
    .string()
    .default("localhost")
    .transform((v) =>
      v
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, ""),
    )
    .refine((v) => v.length > 0 && v.split(".").every((l) => hostLabel.test(l)), {
      message:
        "APP_BASE_DOMAIN must be a valid hostname, for example localhost or schoolhub.example",
    }),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  API_BASE_URL: z.url(),
  BFF_API_KEY: z.string().min(16, "BFF_API_KEY must be set (at least 16 characters)"),
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(5).default(0),
  DEV_TENANT_SLUG: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : undefined))
    .refine((v) => v === undefined || hostLabel.test(v), {
      message: "DEV_TENANT_SLUG is not a valid slug",
    }),
  DOWNLOAD_ALLOWED_HOSTS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "env"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: drop the memoized environment. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
