import type { Server } from "node:http";
import { FAKE_API_URL, startFakeApi } from "./fake-api";

let server: Server | undefined;

export default async function globalSetup() {
  server = await startFakeApi();
  return async () => {
    // Fail the run if any request in this run did not match docs/openapi/v1.json.
    const recorded = (await (await fetch(`${FAKE_API_URL}/__contract`)).json()) as {
      method: string;
      path: string;
      problem: string;
    }[];
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (recorded.length > 0) {
      throw new Error(
        `Test double received ${recorded.length} request(s) that do not match the contract:\n` +
          recorded.map((v) => `  ${v.method} ${v.path}: ${v.problem}`).join("\n"),
      );
    }
  };
}
