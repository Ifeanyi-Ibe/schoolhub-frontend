import { describe, expect, it } from "vitest";
import {
  findOperation,
  isFeatureAvailable,
  isOperationAvailable,
  operationId,
} from "./capabilities";

describe("capabilities", () => {
  it("builds operation IDs with an uppercase method and a leading slash", () => {
    expect(operationId("get", "api/v1/students")).toBe("GET /api/v1/students");
  });

  it("finds operations the contract declares and hides ones it does not", () => {
    expect(isOperationAvailable("GET", "/api/v1/students")).toBe(true);
    expect(isOperationAvailable("GET", "/api/v1/dashboard/bursar")).toBe(false); // BACKEND_GAPS B-15
    expect(isOperationAvailable("POST", "/api/v1/platform/plans")).toBe(false); // BACKEND_GAPS B-14
  });

  it("exposes the header policies and access class from the generated manifest", () => {
    expect(findOperation("POST", "/api/v1/payments/manual")).toMatchObject({
      idempotent: true,
      ifMatch: false,
    });
    expect(findOperation("POST", "/api/v1/auth/login")).toMatchObject({ access: "anonymous" });
    expect(findOperation("GET", "/api/v1/me")?.access).toBe("signed-in");
  });

  it("treats a feature as available when every fallback operation exists", () => {
    expect(isFeatureAvailable("not-flagged", [{ method: "GET", path: "/api/v1/students" }])).toBe(
      true,
    );
    expect(
      isFeatureAvailable("not-flagged", [{ method: "GET", path: "/api/v1/dashboard/bursar" }]),
    ).toBe(false);
    expect(isFeatureAvailable("not-flagged")).toBe(false);
  });
});
