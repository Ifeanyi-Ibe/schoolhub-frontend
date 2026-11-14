// The scheme and origins for the browser and API journeys. E2E_HTTPS=1 (scripts/e2e-https.mjs) runs
// the same journeys over HTTPS, where the BFF names its session cookies with the __Host- prefix.
export const HTTPS = process.env.E2E_HTTPS === "1";
const SCHEME = HTTPS ? "https" : "http";
const PORT = HTTPS ? Number(process.env.E2E_HTTPS_PORT ?? 4443) : 3000;

export const SCHOOL_ORIGIN = `${SCHEME}://greenfield.localhost:${PORT}`;
export const OTHER_ORIGIN = `${SCHEME}://other.localhost:${PORT}`;

/** A session cookie name as the BFF sets it for this scheme (`__Host-` over https). */
export const cookie = (name: string) => (HTTPS ? `__Host-${name}` : name);
export const COOKIE = { at: cookie("sh_at"), rt: cookie("sh_rt") } as const;
