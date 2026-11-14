// API-level requests (Playwright's request client) cannot resolve *.localhost, so they connect to
// loopback and send the school's Host header. Chromium resolves *.localhost itself, so browser
// tests use the school host directly.
export const LOOPBACK = "http://127.0.0.1:3000";
export const SCHOOL_HOST = "greenfield.localhost:3000";
export const SCHOOL = { baseURL: LOOPBACK, extraHTTPHeaders: { host: SCHOOL_HOST } } as const;
