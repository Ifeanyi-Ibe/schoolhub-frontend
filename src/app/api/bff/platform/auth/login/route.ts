// Platform sign-in, password step (ADR 0027): see src/server/platform-routes.ts.
import { createBffDeps } from "@/server/deps";
import { handlePlatformLogin } from "@/server/platform-routes";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handlePlatformLogin(request, createBffDeps());
}
