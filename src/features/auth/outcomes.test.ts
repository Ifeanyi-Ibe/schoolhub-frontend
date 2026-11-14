import { describe, expect, it } from "vitest";
import { afterSignIn, loginFailure, nextStep } from "./outcomes";

const fail = (status: number, code: string | null = null) => ({
  ok: false as const,
  status,
  code,
  retryAfter: null,
});

describe("loginFailure", () => {
  it("gives the same message for an unknown account and a wrong password", () => {
    expect(loginFailure(fail(401, "auth.invalid_credentials"))).toBe("invalid");
    expect(loginFailure(fail(401, "auth.token_invalid"))).toBe("invalid");
    expect(loginFailure(fail(400, "bff.validation_failed"))).toBe("invalid");
  });

  it("uses the rate-limit countdown for 429, including a locked account", () => {
    expect(loginFailure(fail(429, "auth.account_locked"))).toBe("rate");
  });

  it("separates the suspended school, the unknown school, and an unreachable server", () => {
    expect(loginFailure(fail(402, "billing.suspended"))).toBe("billing");
    expect(loginFailure(fail(404, "tenancy.not_found"))).toBe("notFound");
    expect(loginFailure(fail(502))).toBe("unavailable");
    expect(loginFailure(fail(0, "network"))).toBe("unavailable");
    expect(loginFailure(fail(418))).toBe("generic");
  });
});

describe("nextStep", () => {
  it("accepts only the three known statuses", () => {
    expect(nextStep({ status: "mfa_required" })).toBe("mfa_required");
    expect(nextStep({ status: "enrollment_required" })).toBe("enrollment_required");
    expect(nextStep({ status: "signed_in" })).toBe("signed_in");
    expect(nextStep({ status: "anything" })).toBe("unknown");
    expect(nextStep({})).toBe("unknown");
  });
});

describe("afterSignIn", () => {
  it("returns a same-origin path, or home", () => {
    expect(afterSignIn("/sessions")).toBe("/sessions");
    expect(afterSignIn("//evil.example")).toBe("/home");
    expect(afterSignIn("https://evil.example")).toBe("/home");
    expect(afterSignIn(null)).toBe("/home");
  });
});
