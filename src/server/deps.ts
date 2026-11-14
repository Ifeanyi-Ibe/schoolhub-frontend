// Wires the real environment, API client and clock into the BFF pipeline.

import { createApiClient } from "./api-client";
import { getEnv } from "./env";
import type { BffDeps } from "./bff-proxy";

export function createBffDeps(): BffDeps {
  const env = getEnv();
  return {
    env,
    api: createApiClient({ apiBaseUrl: env.API_BASE_URL, bffKey: env.BFF_API_KEY }),
    fetchExternal: (input, init) => fetch(input, init),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: () => Math.random(),
  };
}
