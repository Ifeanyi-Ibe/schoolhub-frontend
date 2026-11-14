// Loads .env.e2e (git-ignored). Nothing is hardcoded in tests: every credential and host comes from
// here. Fails loudly when a value is missing or still a placeholder.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), ".env.e2e");
if (!existsSync(file)) {
  throw new Error(
    "Create .env.e2e from .env.e2e.example and fill in the seeded values (docs/backend/DEV_SEED.md).",
  );
}
process.loadEnvFile(file);

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.startsWith("replace-with"))
    throw new Error(`${name} is missing or still a placeholder in .env.e2e`);
  return v;
}

export const e2e = {
  apiBaseUrl: required("E2E_API_BASE_URL").replace(/\/+$/, ""),
  bffKey: required("E2E_BFF_KEY"),
  schoolSlug: required("E2E_SCHOOL_SLUG"),
  port: Number(required("E2E_PORT")),
  adminIdentifier: required("E2E_ADMIN_IDENTIFIER"),
  adminPassword: required("E2E_ADMIN_PASSWORD"),
  parentPhone: required("E2E_PARENT_PHONE"),
  platformIdentifier: required("E2E_PLATFORM_IDENTIFIER"),
  platformPassword: required("E2E_PLATFORM_PASSWORD"),
  platformTotpSecret: required("E2E_PLATFORM_TOTP_SECRET"),
};
