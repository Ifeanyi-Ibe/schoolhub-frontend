// The browser's typed client for the platform area (ADR 0027). Its base is the platform proxy, never the school proxy: a platform
// call carries the platform cookie only, and the school proxy refuses platform paths (security review, finding F1).
import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { CSRF_HEADER_NAME } from "./csrf";

export const platformClient = createClient<paths>({
  baseUrl: "/api/bff/platform",
  headers: { [CSRF_HEADER_NAME]: "1" },
  credentials: "same-origin",
});
