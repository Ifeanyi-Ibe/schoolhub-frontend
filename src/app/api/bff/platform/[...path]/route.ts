// The platform API proxy (ADR 0027): only api/v1/platform/..., with the platform access cookie.
import { createBffDeps } from "@/server/deps";
import { handlePlatformProxy } from "@/server/platform-routes";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  return handlePlatformProxy(request, path, createBffDeps());
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
