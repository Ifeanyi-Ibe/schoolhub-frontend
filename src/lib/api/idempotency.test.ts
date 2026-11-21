import { describe, expect, it } from "vitest";
import {
  canAutoRetry,
  isValidIdempotencyKey,
  newActionKey,
  writePolicyHeaders,
} from "./idempotency";

describe("newActionKey", () => {
  it("creates a UUID that satisfies the 8 to 128 character rule", () => {
    const key = newActionKey();
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(isValidIdempotencyKey(key)).toBe(true);
  });

  it("rejects keys outside 8 to 128 characters", () => {
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(129))).toBe(false);
  });
});

describe("canAutoRetry", () => {
  it("allows retry only where the contract declares Idempotency-Key", () => {
    expect(canAutoRetry("POST", "/api/v1/payments/manual")).toBe(true);
    // A create the contract does not key (class levels) is never retried automatically.
    expect(canAutoRetry("POST", "/api/v1/class-levels")).toBe(false);
    expect(canAutoRetry("GET", "/api/v1/students")).toBe(false);
  });
});

describe("writePolicyHeaders", () => {
  const key = "0190a6c2-7d4e-7000-8000-123456789abc";

  it("sends Idempotency-Key only on declared operations", () => {
    const declared = writePolicyHeaders({
      method: "POST",
      path: "/api/v1/payments/manual",
      idempotencyKey: key,
    });
    expect(declared.headers["Idempotency-Key"]).toBe(key);
    expect(declared.sent.idempotencyKey).toBe(true);

    const undeclared = writePolicyHeaders({
      method: "POST",
      path: "/api/v1/class-levels",
      idempotencyKey: key,
    });
    expect(undeclared.headers).toEqual({});
    expect(undeclared.sent.idempotencyKey).toBe(false);
  });

  it("never sends If-Match today, because no operation declares it (BACKEND_GAPS B-05)", () => {
    const res = writePolicyHeaders({
      method: "PATCH",
      path: "/api/v1/students/{id}",
      rowVersion: 7,
    });
    expect(res.headers).toEqual({});
    expect(res.sent.ifMatch).toBe(false);
  });

  it("refuses a malformed key instead of sending it", () => {
    expect(() =>
      writePolicyHeaders({ method: "POST", path: "/api/v1/payments/manual", idempotencyKey: "x" }),
    ).toThrow(RangeError);
  });
});
