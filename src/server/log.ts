// Structured logs for the BFF. Logs carry route templates and status codes only: never query
// strings, bodies, cookies, tokens, the BFF key, or raw IDs.

export type LogLevel = "info" | "warn" | "error";

export interface LogEvent {
  event: string;
  [field: string]: string | number | boolean | null | undefined;
}

const SECRET_KEY = /token|password|authorization|cookie|key|otp|secret|set-cookie/i;

/** Drop any field whose name looks like a credential, even if a caller adds one by mistake. */
export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : v;
  }
  return out;
}

export function log(level: LogLevel, fields: LogEvent): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...redactFields(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route template for logs: IDs become `:id`, so no record identifiers reach the logs. */
export function routeTemplate(segments: readonly string[]): string {
  return (
    "/" +
    segments
      .map((s) => {
        if (UUID.test(s)) return ":id";
        if (/^\d+$/.test(s)) return ":n";
        return s;
      })
      .join("/")
  );
}
