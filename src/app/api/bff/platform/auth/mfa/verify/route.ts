// Platform sign-in, MFA step (ADR 0027): see src/server/platform-routes.ts.
import { createBffDeps } from "@/server/deps";
import { handlePlatformMfa } from "@/server/platform-routes";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handlePlatformMfa(request, createBffDeps());
}
