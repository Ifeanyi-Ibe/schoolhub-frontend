// Preflight for the real-backend suite. Fails at once with a clear message when the API is not
// reachable or does not accept the BFF key in .env.e2e, instead of letting every journey time out.
//
//   npm run test:real   (runs this first)
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = process.env.E2E_ENV_FILE ?? resolve(root, ".env.e2e");
if (!existsSync(envFile)) fail("Missing .env.e2e. See .env.example (the e2e section).");

const env = {};
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2];
}
const api = (env.E2E_API_BASE_URL ?? "").replace(/\/+$/, "");
const key = env.E2E_BFF_KEY ?? "";
const school = env.E2E_SCHOOL_SLUG ?? "";
if (!api || !key || !school)
  fail("E2E_API_BASE_URL, E2E_BFF_KEY and E2E_SCHOOL_SLUG must be set in .env.e2e.");

async function get(path, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(api + path, { headers, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fail(message) {
  console.error(`real-backend preflight: ${message}`);
  console.error("Start the backend with scripts/dev-backend.sh (see docs/TESTING.md).");
  process.exit(1);
}

const health = await get("/health/live");
if (!health || health.status !== 200) {
  fail(`the API at ${api} is not reachable (GET /health/live).`);
}

const probe = await get(`/api/v1/public/tenants/${encodeURIComponent(school)}/branding`, {
  "X-Bff-Key": key,
  "X-Tenant": school,
});
if (!probe) fail(`the API at ${api} did not answer the branding probe in time.`);
if (probe.status === 401 && probe.body?.code === "bff.key_invalid") {
  fail(
    "the backend rejects the BFF key in .env.e2e (bff.key_invalid). The running backend was started with a different key. Restart it with scripts/dev-backend.sh.",
  );
}
if (probe.status !== 200) {
  fail(
    `the branding probe for school "${school}" answered ${probe.status}. Check E2E_SCHOOL_SLUG and the seed.`,
  );
}
console.log(`real-backend preflight: API healthy, BFF key accepted, school "${school}" found.`);
