// Replaces docs/openapi/v1.json with the backend's COMMITTED Staging export, and prints what changed.
//
// Only this script may change the contract. The source is `git show HEAD:docs/openapi/v1.json` in the
// backend repository (never its working copy, and never a running Development instance, which serves
// /api/v1/dev/* routes). Nothing is written without --write. After writing, the generated client is
// rebuilt, so `npm run api:check` passes only when the contract and the outputs agree.
//
//   npm run api:sync                 print the diff (dry run)
//   npm run api:sync -- --write      write the spec, then run api:gen
//
// SCHOOLHUB_BACKEND_DIR overrides the backend path (default: ../School-Management).
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(root, "docs/openapi/v1.json");
const backendDir = resolve(
  process.env.SCHOOLHUB_BACKEND_DIR ?? resolve(root, "../School-Management"),
);
const write = process.argv.includes("--write");

function committedSpec() {
  try {
    execSync("git rev-parse --git-dir", { cwd: backendDir, stdio: "ignore" });
  } catch {
    throw new Error(`Not a git repository: ${backendDir}. Set SCHOOLHUB_BACKEND_DIR.`);
  }
  return execFileSync("git", ["show", "HEAD:docs/openapi/v1.json"], {
    cwd: backendDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function summarise(oldSpec, newSpec) {
  const paths = (s) => new Set(Object.keys(s.paths ?? {}));
  const schemas = (s) => new Set(Object.keys(s.components?.schemas ?? {}));
  const diff = (a, b) => [...b].filter((x) => !a.has(x));
  const oldP = paths(oldSpec);
  const newP = paths(newSpec);
  const oldS = schemas(oldSpec);
  const newS = schemas(newSpec);
  return {
    pathsAdded: diff(newP, oldP),
    pathsRemoved: diff(oldP, newP),
    schemasAdded: diff(newS, oldS),
    schemasRemoved: diff(oldS, newS),
  };
}

const next = committedSpec();
const nextSpec = JSON.parse(next);
if (Object.keys(nextSpec.paths ?? {}).some((p) => p.startsWith("/api/v1/dev/"))) {
  throw new Error("The committed backend export lists /api/v1/dev/* routes. Refusing to sync.");
}
const currentText = readFileSync(specPath, "utf8");
if (currentText === next) {
  console.log(
    "docs/openapi/v1.json already matches the backend's committed export. Nothing to do.",
  );
  process.exit(0);
}
const changes = summarise(JSON.parse(currentText), nextSpec);
console.log(`Contract change from backend ${backendDir} (HEAD):`);
console.log(`  size: ${currentText.length} -> ${next.length} bytes`);
for (const [label, list] of Object.entries(changes)) {
  console.log(`  ${label}: ${list.length}`);
  for (const item of list.slice(0, 40)) console.log(`    ${item}`);
  if (list.length > 40) console.log(`    ... ${list.length - 40} more`);
}
if (!write) {
  console.log("Dry run. Re-run with --write to replace the spec and rebuild the generated client.");
  process.exit(0);
}
writeFileSync(specPath, next);
execSync("node scripts/gen-api.mjs", { cwd: root, stdio: "inherit" });
console.log(
  "Spec replaced and generated client rebuilt. Review the diff and commit both together.",
);
