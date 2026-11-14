import { describe, expect, it, vi } from "vitest";
import { isBillingSuspended, markBillingSuspended } from "@/lib/api/billing-events";
import { signOut } from "./sign-out";

describe("signOut", () => {
  it("ends the server session, clears the query cache and the billing flag", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const queryClient = { clear: vi.fn() };
    markBillingSuspended();
    await signOut({ fetchImpl: fetchImpl as unknown as typeof fetch, queryClient });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/bff/auth/logout");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-schoolhub-request")).toBe("1");
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(isBillingSuspended()).toBe(false);
  });

  it("still clears local state when the network call fails", async () => {
    const queryClient = { clear: vi.fn() };
    const failing = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    await expect(signOut({ fetchImpl: failing, queryClient })).rejects.toThrow("offline");
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });
});
