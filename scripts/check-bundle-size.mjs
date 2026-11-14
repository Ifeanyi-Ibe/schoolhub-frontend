#!/usr/bin/env node
// Bundle-size gate (CLAUDE.md performance budgets). Starts the performance stack (production server
// plus the labelled test double), reads the JavaScript each budgeted route loads on first paint,
// gzips it, and fails when a route group is over its cap. Run after `npm run build`.
//
// BUNDLE_REPORT=1 (with a build made under the same variable, which emits source maps) also prints
// which modules the first-load bytes come from. See scripts/bundle-analysis-lib.mjs.

import { spawn } from "node:child_process";
import { request } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { attributeChunk } from "./bundle-analysis-lib.mjs";
import { checkGroupBudgets, gzipBytes, initialScriptUrls, sumGzip } from "./bundle-size-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(root, "scripts/budgets.json"), "utf8"));
const groups = config.groups;
const port = Number(process.env.SIZE_PORT ?? 3917);
const host = `greenfield.localhost:${port}`;
const report = process.env.BUNDLE_REPORT === "1";

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

/** Prints the modules behind a route's first-load bytes, with gzip estimated per module. */
function printModuleReport(route, assets) {
  const raw = new Map();
  for (const asset of assets) {
    const file = resolve(root, ".next", asset.url.replace(/^\/_next\//, ""));
    const mapFile = `${file}.map`;
    if (!existsSync(file) || !existsSync(mapFile)) {
      console.log(`    (no source map for ${asset.url}; build with BUNDLE_REPORT=1)`);
      continue;
    }
    const code = readFileSync(file, "utf8");
    const owners = attributeChunk(code, JSON.parse(readFileSync(mapFile, "utf8")));
    // Estimate gzip per module: each chunk's own gzip ratio applied to that module's raw bytes.
    const ratio = asset.gzipBytes / Math.max(1, asset.bytes);
    for (const [owner, bytes] of owners) raw.set(owner, (raw.get(owner) ?? 0) + bytes * ratio);
  }
  const ranked = [...raw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`  modules in ${route} (estimated gzip bytes):`);
  for (const [owner, gz] of ranked)
    console.log(`    ${Math.round(gz).toString().padStart(7)} B  ${owner}`);
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
    for (const [name, group] of Object.entries(groups)) {
      for (const [route, opts] of Object.entries(group.routes)) {
        const cookie = opts.cookie;
        const m = await measure(route, cookie);
        results[route] = m.total;
        console.log(
          `${name}  ${route}  first-load JS: ${m.total} B gzipped (${m.assets.length} files)${cookie ? " [signed in]" : " [signed out]"}`,
        );
        for (const a of m.assets) console.log(`    ${a.gzipBytes} B  ${a.url}`);
        if (report) printModuleReport(route, m.assets);
      }
    }
    const { failures, reports } = checkGroupBudgets(results, groups);
    console.log("\nGroup budgets:");
    for (const r of reports) {
      if (r.worst === null) {
        console.log(`  ${r.group}: no routes yet; cap ${r.cap} B reserved`);
        continue;
      }
      const target = r.target === null ? "" : `, target ${r.target} B`;
      console.log(
        `  ${r.group}: worst ${r.worst.route} ${r.worst.bytes} B, cap ${r.cap} B${target}${
          r.target !== null && r.worst.bytes > r.target ? " (above target)" : ""
        }`,
      );
    }
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
