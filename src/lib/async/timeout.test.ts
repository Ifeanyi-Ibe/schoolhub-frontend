import { describe, expect, it } from "vitest";
import { withTimeout } from "./timeout";

describe("a send that never answers is bounded", () => {
  it("passes through an answer that arrives in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("fails when the answer never comes", async () => {
    const never = new Promise<string>(() => undefined);
    await expect(withTimeout(never, 10)).rejects.toThrow("timeout");
  });
});
