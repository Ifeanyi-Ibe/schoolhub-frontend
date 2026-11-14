// The browser's typed API client. Requests go to the BFF (/api/bff), never to the .NET API.
// Types come only from the generated schema (schema.d.ts). No hand-written API types.

import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { CSRF_HEADER_NAME } from "./csrf";

export const apiClient = createClient<paths>({
  baseUrl: "/api/bff",
  // Sent on every request. The BFF requires it on mutations (CSRF defence).
  headers: { [CSRF_HEADER_NAME]: "1" },
  credentials: "same-origin",
});
