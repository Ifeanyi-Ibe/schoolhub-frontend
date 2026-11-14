// Catch-all BFF proxy: the browser calls /api/bff/api/v1/... and this forwards to the .NET API.
import { handleProxy } from "@/server/bff-proxy";
import { createBffDeps } from "@/server/deps";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params;
  return handleProxy(request, path, createBffDeps());
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
