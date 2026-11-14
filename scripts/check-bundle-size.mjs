#!/usr/bin/env node
// Bundle-size gate (CLAUDE.md performance budgets). Starts the production server, reads the
// JavaScript each budgeted page loads on first paint, gzips it, and fails when a page is over
// budget. Run after `npm run build`. Needs .env.local (or the environment) for the server.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBudgets, gzipBytes, initialScriptUrls, sumGzip } from "./bundle-size-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(
  readFileSync(resolve(root, "scripts/budgets.json"), "utf8"),
).firstLoadJsGzipBytes;
const port = Number(process.env.SIZE_PORT ?? 3917);
const base = `http://localhost:${port}`;

async function waitForServer(child, timeoutMs = 60_000) {
  const started = Date.now();
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/bff/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (child.exitCode !== null) throw new Error(`next start exited early:\n${output}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start did not become ready:\n${output}`);
}

async function measureRoute(route) {
  const html = await (await fetch(`${base}${route}`, { headers: { Accept: "text/html" } })).text();
  const urls = initialScriptUrls(html);
  const assets = [];
  for (const url of urls) {
    const body = Buffer.from(await (await fetch(`${base}${url}`)).arrayBuffer());
    assets.push({ url, bytes: body.length, gzipBytes: gzipBytes(body) });
  }
  return { route, assets, total: sumGzip(assets) };
}

async function main() {
  const child = spawn(
    process.execPath,
    [resolve(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitForServer(child);
    const results = {};
    for (const route of Object.keys(budgets)) {
      const m = await measureRoute(route);
      results[route] = m.total;
      console.log(`${route}  first-load JS: ${m.total} B gzipped (${m.assets.length} files)`);
      for (const a of m.assets) console.log(`    ${a.gzipBytes} B  ${a.url}`);
    }
    const failures = checkBudgets(results, budgets);
    if (failures.length > 0) {
      console.error("Bundle budget exceeded:");
      for (const f of failures) console.error(`  ${f}`);
      process.exitCode = 1;
    } else {
      console.log("All budgets met.");
    }
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
