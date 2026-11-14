// The performance stack: the production server plus the labelled API test double (e2e/fake-api.ts),
// with the school host set up exactly as in the e2e run. Used by the bundle-size gate and by
// Lighthouse CI. Prints STACK_READY once the server answers. It is not a backend.
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeApi, FAKE_API_PORT, TEST_BFF_KEY, TENANT } from "../e2e/fake-api.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.STACK_PORT ?? 3100);
const origin = `http://${TENANT}.localhost:${port}`;

const fake = await startFakeApi();
const next: ChildProcess = spawn(
  process.execPath,
  [resolve(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      API_BASE_URL: `http://127.0.0.1:${FAKE_API_PORT}`,
      BFF_API_KEY: TEST_BFF_KEY,
      APP_BASE_DOMAIN: "localhost",
      APP_ORIGIN: origin,
      DEV_TENANT_SLUG: TENANT,
      DOWNLOAD_ALLOWED_HOSTS: "127.0.0.1",
      REFRESH_GRACE_SECONDS: "10",
    },
  },
);
next.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
next.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

async function ready(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/bff/health`, {
        headers: { host: `${TENANT}.localhost:${port}` },
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become ready");
}

await ready();
console.log(`STACK_READY ${origin}`);

const stop = () => {
  next.kill("SIGTERM");
  fake.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
