// Platform sign-out (ADR 0027): clears the platform cookies only.
import { createBffDeps } from "@/server/deps";
import { handlePlatformLogout } from "@/server/platform-routes";

export const dynamic = "force-dynamic";

export function POST(request: Request): Response {
  return handlePlatformLogout(request, createBffDeps());
}
