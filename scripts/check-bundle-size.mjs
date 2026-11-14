#!/usr/bin/env node
// Bundle-size gate (CLAUDE.md performance budgets). Starts the performance stack (production server
// plus the labelled test double), reads the JavaScript each budgeted page loads on first paint,
// gzips it, and fails when a page is over budget. Run after `npm run build`.

import { spawn } from "node:child_process";
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBudgets, gzipBytes, initialScriptUrls, sumGzip } from "./bundle-size-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(root, "scripts/budgets.json"), "utf8"));
const budgets = config.firstLoadJsGzipBytes;
const routes = config.routes;
const port = Number(process.env.SIZE_PORT ?? 3917);
const host = `greenfield.localhost:${port}`;

// GET through node:http so the school Host header can be set (fetch does not allow it).
function get(path, headers = {}) {
  return new Promise((resolveP, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method: "GET", headers: { host, ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolveP({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitForStack(child, timeoutMs = 180_000) {
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (output.includes("STACK_READY")) return;
    if (child.exitCode !== null) throw new Error(`stack exited early:\n${output}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`stack did not become ready:\n${output}`);
}

async function measure(route, cookie) {
  const headers = cookie ? { cookie } : {};
  const html = (await get(route, headers)).body.toString("utf8");
  const assets = [];
  for (const url of initialScriptUrls(html)) {
    const body = (await get(url, headers)).body;
    assets.push({ url, bytes: body.length, gzipBytes: gzipBytes(body) });
  }
  return { route, assets, total: sumGzip(assets) };
}

async function main() {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", resolve(root, "scripts/stack.mts")],
    {
      cwd: root,
      env: { ...process.env, STACK_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitForStack(child);
    const results = {};
    for (const route of Object.keys(budgets)) {
      const cookie = routes[route]?.cookie;
      const m = await measure(route, cookie);
      results[route] = m.total;
      console.log(
        `${route}  first-load JS: ${m.total} B gzipped (${m.assets.length} files)${cookie ? " [signed in]" : " [signed out]"}`,
      );
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
