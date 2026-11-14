import { describe, expect, it } from "vitest";
import { loadBranding } from "./branding";
import { fakeApi, json } from "./test-helpers";

const body = {
  name: "Greenfield Academy",
  logoUrl: "https://files.example/logo.png",
  primaryColor: "#c2410c",
  secondaryColor: "#1e3a8a",
  motto: "Knowledge first",
  supportEmail: null,
  supportPhone: null,
};

describe("loadBranding", () => {
  it("reads anonymously by the school's slug and returns the typed view", async () => {
    const api = fakeApi(() => json(200, body));
    const res = await loadBranding({ api }, "greenfield");
    expect(res).toEqual({ status: "ok", branding: body });
    expect(api.calls[0]).toMatchObject({
      method: "GET",
      path: "api/v1/public/tenants/greenfield/branding",
      tenantSlug: "greenfield",
    });
  });

  it("reports an unknown or cancelled school as not_found", async () => {
    expect(await loadBranding({ api: fakeApi(() => json(404, {})) }, "nope")).toEqual({
      status: "not_found",
    });
  });

  it("refuses a slug that is not a plain label, without calling the API", async () => {
    const api = fakeApi(() => json(200, body));
    expect(await loadBranding({ api }, "../admin")).toEqual({ status: "not_found" });
    expect(api.calls).toHaveLength(0);
  });

  it("treats a body that drifted from the contract as unavailable", async () => {
    const res = await loadBranding({ api: fakeApi(() => json(200, { name: "X" })) }, "greenfield");
    expect(res.status).toBe("unavailable");
  });

  it("treats a network failure as unavailable, not as a missing school", async () => {
    const res = await loadBranding(
      { api: { call: async () => Promise.reject(new TypeError("down")) } },
      "greenfield",
    );
    expect(res.status).toBe("unavailable");
  });
});
