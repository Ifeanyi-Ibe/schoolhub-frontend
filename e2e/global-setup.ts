import type { Server } from "node:http";
import { startFakeApi } from "./fake-api";

let server: Server | undefined;

export default async function globalSetup() {
  server = await startFakeApi();
  return async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  };
}
