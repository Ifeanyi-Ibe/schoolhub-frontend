import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  API_BASE_URL: "http://localhost:5152",
  BFF_API_KEY: "0123456789abcdef",
};

describe("parseEnv", () => {
  it("defaults the base domain to localhost and the origin to port 3000", () => {
    const env = parseEnv(valid);
    expect(env.APP_BASE_DOMAIN).toBe("localhost");
    expect(env.APP_ORIGIN).toBe("http://localhost:3000");
    expect(env.TRUSTED_PROXY_COUNT).toBe(0);
  });

  it("normalises the base domain and parses the download allow-list", () => {
    const env = parseEnv({
      ...valid,
      APP_BASE_DOMAIN: " .SchoolHub.Example. ",
      DOWNLOAD_ALLOWED_HOSTS: "Files.Example.com, s3.example.com ,",
    });
    expect(env.APP_BASE_DOMAIN).toBe("schoolhub.example");
    expect(env.DOWNLOAD_ALLOWED_HOSTS).toEqual(["files.example.com", "s3.example.com"]);
  });

  it("rejects a missing API URL and a short BFF key, naming the variable", () => {
    expect(() => parseEnv({ BFF_API_KEY: valid.BFF_API_KEY })).toThrow(/API_BASE_URL/);
    expect(() => parseEnv({ ...valid, BFF_API_KEY: "short" })).toThrow(/BFF_API_KEY/);
  });

  it("rejects an invalid base domain and an invalid dev tenant slug", () => {
    expect(() => parseEnv({ ...valid, APP_BASE_DOMAIN: "bad_domain!" })).toThrow(/APP_BASE_DOMAIN/);
    expect(() => parseEnv({ ...valid, DEV_TENANT_SLUG: "Not A Slug" })).toThrow(/DEV_TENANT_SLUG/);
  });

  it("caps trusted proxy hops", () => {
    expect(() => parseEnv({ ...valid, TRUSTED_PROXY_COUNT: "9" })).toThrow(/TRUSTED_PROXY_COUNT/);
  });
});
