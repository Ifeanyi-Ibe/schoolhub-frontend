// A small stand-in for the .NET API, used only by the BFF integration tests.
// It records the headers it receives so tests can assert what the BFF forwards.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const FAKE_API_PORT = 5999;
export const FAKE_API_URL = `http://127.0.0.1:${FAKE_API_PORT}`;

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/** Unsigned JWT with a 15 minute expiry, enough for the BFF's timing logic. */
export function fakeJwt(label: string, expiresInSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64({ alg: "none" })}.${b64({ sub: label, exp })}.sig`;
}

const received = new Map<string, Record<string, string | undefined>>();
const raced = new Set<string>();

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const isText = typeof body === "string";
  res.writeHead(status, { "Content-Type": isText ? "text/plain" : "application/json", ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function headerSnapshot(req: IncomingMessage): Record<string, string | undefined> {
  const h = req.headers;
  return {
    authorization: h.authorization,
    "x-bff-key": h["x-bff-key"] as string | undefined,
    "x-tenant": h["x-tenant"] as string | undefined,
    "x-forwarded-for": h["x-forwarded-for"] as string | undefined,
    "x-client-user-agent": h["x-client-user-agent"] as string | undefined,
    cookie: h.cookie,
    "idempotency-key": h["idempotency-key"] as string | undefined,
  };
}

export function startFakeApi(): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", FAKE_API_URL);
    const path = url.pathname;

    if (path === "/__received") {
      const key = url.searchParams.get("path") ?? "";
      return send(res, 200, received.get(key) ?? {});
    }

    // Keyed by path and query, so parallel tests can each read their own request (see bff.spec.ts).
    received.set(path + url.search, headerSnapshot(req));
    const bodyText = req.method === "GET" ? "" : await readBody(req);

    if (path === "/api/v1/auth/refresh") {
      const { refreshToken } = JSON.parse(bodyText || "{}") as { refreshToken?: string };
      if (refreshToken === "dead")
        return send(res, 401, { title: "Invalid refresh token", code: "auth.token_invalid" });
      if (refreshToken === "race" && !raced.has("race")) {
        raced.add("race");
        return send(res, 409, { title: "Refresh in flight", code: "auth.refresh_in_flight" });
      }
      return send(res, 200, {
        accessToken: fakeJwt("rotated"),
        refreshToken: `rotated-${refreshToken}`,
        expiresIn: 900,
        tokenType: "Bearer",
        mfaRequired: false,
        mfaToken: null,
        mfaEnrollmentRequired: false,
        enrollmentToken: null,
      });
    }

    if (path === "/api/v1/me") {
      const auth = req.headers.authorization;
      if (!auth || auth === "Bearer stale")
        return send(res, 401, { title: "Unauthorized", code: "auth.token_invalid" });
      return send(res, 200, { ok: true, bearer: auth.slice(7, 20) });
    }

    if (path === "/api/v1/students" && req.method === "POST") {
      return send(
        res,
        201,
        { created: true, echo: JSON.parse(bodyText || "{}") },
        { "Idempotency-Replayed": "false" },
      );
    }

    if (path === "/api/v1/payments/9/receipt") {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="receipt-9.pdf"',
        "Set-Cookie": "upstream=leak; Path=/",
      });
      return res.end("%PDF-1.7 fake");
    }

    if (path === "/api/v1/billing/suspended") {
      return send(res, 402, { title: "Account suspended", code: "billing.suspended" });
    }

    if (path === "/export.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="export.csv"',
      });
      return res.end("a,b\n1,2\n");
    }

    return send(res, 404, { title: "Not found", code: "students.not_found" });
  });
  return new Promise((resolve) => server.listen(FAKE_API_PORT, "127.0.0.1", () => resolve(server)));
}
