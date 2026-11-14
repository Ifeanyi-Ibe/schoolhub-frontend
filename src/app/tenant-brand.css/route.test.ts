import { beforeEach, describe, expect, it, vi } from "vitest";

const branding = vi.hoisted(() => ({ primaryColor: "#c2410c" as unknown }));

vi.mock("@/server/env", () => ({
  getEnv: () => ({ APP_BASE_DOMAIN: "localhost", DEV_TENANT_SLUG: undefined, NODE_ENV: "test" }),
}));
vi.mock("@/server/deps", () => ({ createBffDeps: () => ({}) }));
vi.mock("@/server/branding", () => ({
  loadBranding: async (_deps: unknown, slug: string) =>
    slug === "greenfield"
      ? { status: "ok", branding: { name: "Greenfield", primaryColor: branding.primaryColor } }
      : { status: "not_found" },
}));

import { GET } from "./route";

const get = (host: string) => GET(new Request("http://x/tenant-brand.css", { headers: { host } }));

beforeEach(() => {
  branding.primaryColor = "#c2410c";
});

describe("/tenant-brand.css", () => {
  it("serves the school's guarded colours as a stylesheet, with no-sniff and a short cache", async () => {
    const res = await get("greenfield.localhost:3000");
    expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toMatch(
      /^\.tenant-brand\{--brand:#[0-9a-f]{6};--on-brand:#[0-9a-f]{6}\}$/,
    );
  });

  it("serves an empty stylesheet (the default theme) for a hostile colour", async () => {
    branding.primaryColor = "#000000;}body{display:none}";
    expect(await (await get("greenfield.localhost:3000")).text()).toBe("");
  });

  it("serves an empty stylesheet for an unknown school, and never reads the school from anything but the host", async () => {
    expect(await (await get("nowhere.localhost:3000")).text()).toBe("");
  });
});
