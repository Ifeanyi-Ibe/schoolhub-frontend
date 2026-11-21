// Request validation for the test double (TEST DOUBLE). Every request the BFF sends to /api/* is
// checked against docs/openapi/v1.json: the operation must exist, required query and header
// parameters must be present, a body must use a declared content type and match the declared schema,
// and Idempotency-Key or If-Match may only be sent where the operation declares them (CLAUDE.md).
// Any mismatch is recorded; the global teardown fails the run if one was recorded.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

export interface Violation {
  method: string;
  path: string;
  problem: string;
}

type Operation = {
  parameters?: { name: string; in: string; required?: boolean }[];
  requestBody?: { required?: boolean; content?: Record<string, { schema?: object }> };
};

const spec = JSON.parse(readFileSync(resolve(process.cwd(), "docs/openapi/v1.json"), "utf8")) as {
  paths: Record<string, Record<string, Operation>>;
};
const METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];
// Formats are not asserted here: the backend's own validation is authoritative for them.
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(spec, "spec");

const escapePointer = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");
const templateToRegex = (template: string) =>
  new RegExp(
    `^${template
      .split(/\{[^}]+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]+")}$`,
  );

const operations = Object.entries(spec.paths).flatMap(([template, item]) =>
  METHODS.flatMap((method) => {
    const op = (item as Record<string, Operation | undefined>)[method];
    return op
      ? [{ method: method.toUpperCase(), template, re: templateToRegex(template), op }]
      : [];
  }),
);

export const violations: Violation[] = [];

/** The declared header names of an operation, lower-cased. */
function declaredHeaders(op: Operation) {
  return new Set(
    (op.parameters ?? []).filter((p) => p.in === "header").map((p) => p.name.toLowerCase()),
  );
}

/** Returns the problems with one request. An empty list means the request matches the contract. */
export function contractProblems(
  method: string,
  pathname: string,
  search: URLSearchParams,
  headers: Record<string, string | string[] | undefined>,
  bodyText: string,
): string[] {
  const candidates = operations.filter((o) => o.method === method && o.re.test(pathname));
  if (candidates.length === 0)
    return [`no operation ${method} ${pathname} in docs/openapi/v1.json`];
  const match = candidates[0]!;
  const op = match.op;
  const problems: string[] = [];
  const header = (name: string) => {
    const v = headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };

  for (const p of op.parameters ?? []) {
    if (!p.required) continue;
    if (p.in === "query" && !search.has(p.name)) problems.push(`missing query ${p.name}`);
    if (p.in === "header" && !header(p.name)) problems.push(`missing header ${p.name}`);
  }

  // Idempotency-Key and If-Match only where the contract declares them.
  const declared = declaredHeaders(op);
  for (const name of ["Idempotency-Key", "If-Match"]) {
    if (header(name) !== undefined && !declared.has(name.toLowerCase()))
      problems.push(`${name} sent to an operation that does not declare it`);
  }

  const body = op.requestBody;
  if (!body) {
    // BACKEND_GAPS B-30: the file-content step carries the raw file, which the contract does not declare. The
    // only exception: a PUT of a file's bytes to /api/v1/files/{id}/content, with any content type.
    const rawFileBytes = method === "PUT" && /^\/api\/v1\/files\/[^/]+\/content$/.test(pathname);
    if (bodyText && !rawFileBytes) problems.push("body sent to an operation with no request body");
    return problems;
  }
  if (!bodyText) {
    if (body.required) problems.push("request body is required");
    return problems;
  }
  const declaredTypes = Object.keys(body.content ?? {});
  const sent =
    String(header("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase() ?? "";
  if (!declaredTypes.includes(sent)) {
    problems.push(
      `content type ${sent || "(none)"} not declared (expected ${declaredTypes.join(", ")})`,
    );
    return problems;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return [...problems, "body is not valid JSON"];
  }
  const ptr = `#/paths/${escapePointer(match.template)}/${method.toLowerCase()}/requestBody/content/${escapePointer(sent)}/schema`;
  const validate = ajv.getSchema(`spec${ptr}`);
  if (!validate) return [...problems, `no schema at ${ptr}`];
  if (!validate(parsed)) {
    for (const e of validate.errors ?? []) {
      problems.push(`body ${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
    }
  }
  return problems;
}
