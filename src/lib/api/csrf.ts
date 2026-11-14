// Name of the custom header the BFF requires on mutating requests (src/server/request-guards.ts).
// Kept in its own module so both the browser client and the BFF share one definition.
export const CSRF_HEADER_NAME = "X-SchoolHub-Request";
