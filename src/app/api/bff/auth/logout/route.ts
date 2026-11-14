// BFF auth route: see src/server/auth-routes.ts.
import { handleLogout } from "@/server/auth-routes";
import { createBffDeps } from "@/server/deps";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleLogout(request, createBffDeps());
}
