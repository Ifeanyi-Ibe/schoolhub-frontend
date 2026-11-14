import { describe, expect, it } from "vitest";
import { checkMutationRequest, validateUpstreamSegments } from "./request-guards";

const APP = "https://greenfield.schoolhub.example";

function req(headers: Record<string, string>) {
  return new Headers(headers);
}

describe("checkMutationRequest", () => {
  it("lets safe methods through without headers", () => {
    expect(checkMutationRequest({ method: "GET", headers: req({}), appOrigin: APP })).toEqual({
      ok: true,
    });
  });

  it("requires the custom header on mutations", () => {
    const res = checkMutationRequest({
      method: "POST",
      headers: req({ origin: APP }),
      appOrigin: APP,
    });
    expect(res).toMatchObject({ ok: false, status: 403, code: "bff.csrf_header_missing" });
  });

  it("requires an Origin equal to our own origin", () => {
    const base = { "x-schoolhub-request": "1" };
    expect(
      checkMutationRequest({ method: "POST", headers: req(base), appOrigin: APP }),
    ).toMatchObject({
      code: "bff.origin_missing",
    });
    expect(
      checkMutationRequest({
        method: "POST",
        headers: req({ ...base, origin: "https://evil.example" }),
        appOrigin: APP,
      }),
    ).toMatchObject({ code: "bff.origin_mismatch" });
  });

  it("refuses requests the browser marks cross-site, even with a matching origin", () => {
    const res = checkMutationRequest({
      method: "PUT",
      headers: req({ "x-schoolhub-request": "1", origin: APP, "sec-fetch-site": "cross-site" }),
      appOrigin: APP,
    });
    expect(res).toMatchObject({ ok: false, code: "bff.cross_site" });
  });

  it("accepts a same-origin mutation with the header", () => {
    const res = checkMutationRequest({
      method: "POST",
      headers: req({ "x-schoolhub-request": "1", origin: APP, "sec-fetch-site": "same-origin" }),
      appOrigin: APP,
    });
    expect(res).toEqual({ ok: true });
  });
});

describe("validateUpstreamSegments", () => {
  it("accepts api/v1 paths made of plain segments", () => {
    expect(validateUpstreamSegments(["api", "v1", "students", "0190-abc"])).toBe(
      "api/v1/students/0190-abc",
    );
  });

  it("refuses other prefixes, dot segments, encoded separators and empty paths", () => {
    expect(validateUpstreamSegments(["admin", "v1", "x"])).toBeNull();
    expect(validateUpstreamSegments(["api", "v1", ".."])).toBeNull();
    expect(validateUpstreamSegments(["api", "v1", "a/b"])).toBeNull();
    expect(validateUpstreamSegments(["api", "v1", "a%2fb"])).toBeNull();
    expect(validateUpstreamSegments(["api", "v1"])).toBeNull();
    expect(validateUpstreamSegments(["api", "v1", ""])).toBeNull();
  });
});
