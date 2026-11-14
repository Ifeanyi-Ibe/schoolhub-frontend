#!/usr/bin/env node
// Runs the Chromium e2e journeys over HTTPS, so the BFF issues Secure cookies with the __Host- prefix
// end to end (ADR 0003, docs/LOCAL_HTTPS.md). A throwaway self-signed certificate for localhost and
// the school hosts is made in a temporary directory; a small TLS proxy terminates HTTPS in front of
// the production server (port E2E_PORT, default 3000). Nothing is installed system-wide.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const listenPort = Number(process.env.E2E_HTTPS_PORT ?? 4443);
const targetPort = Number(process.env.E2E_PORT ?? 3000);
const dir = mkdtempSync(join(tmpdir(), "schoolhub-tls-"));
const keyPath = join(dir, "key.pem");
const certPath = join(dir, "cert.pem");

try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,DNS:greenfield.localhost,DNS:demo.localhost",
    ],
    { stdio: "ignore" },
  );

  const proxy = createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    (req, res) => {
      const upstream = httpRequest(
        {
          host: "127.0.0.1",
          port: targetPort,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  await new Promise((resolve) => proxy.listen(listenPort, "127.0.0.1", resolve));

  const playwright = spawn(
    process.execPath,
    [
      join(process.cwd(), "node_modules/@playwright/test/cli.js"),
      "test",
      "--project=desktop",
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: { ...process.env, E2E_HTTPS: "1", E2E_HTTPS_PORT: String(listenPort) },
    },
  );
  const code = await new Promise((resolve) => playwright.on("exit", (c) => resolve(c ?? 1)));
  await new Promise((resolve) => proxy.close(resolve));
  process.exitCode = code;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
