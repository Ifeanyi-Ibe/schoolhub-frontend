// Platform enrolment, start (ADR 0027, B-52).
import { createBffDeps } from "@/server/deps";
import { handlePlatformEnrolStart } from "@/server/platform-routes";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handlePlatformEnrolStart(request, createBffDeps());
}
