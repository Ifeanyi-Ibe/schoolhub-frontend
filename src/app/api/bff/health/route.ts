// Liveness for the container orchestrator. Reveals no configuration and calls nothing upstream.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
