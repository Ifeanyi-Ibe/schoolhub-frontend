// BFF auth route: see src/server/auth-routes.ts.
import { handlePasswordReset } from "@/server/auth-routes";
import { createBffDeps } from "@/server/deps";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handlePasswordReset(request, createBffDeps());
}
