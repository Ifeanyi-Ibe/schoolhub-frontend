import { describe, expect, it } from "vitest";
import { redactFields, routeTemplate } from "./log";

describe("redactFields", () => {
  it("masks anything that looks like a credential, and keeps everything else", () => {
    expect(
      redactFields({
        event: "bff.proxy",
        accessToken: "a.b.c",
        refreshToken: "r",
        authorization: "Bearer x",
        cookie: "sh_at=1",
        "x-bff-key": "k",
        otp: "123456",
        status: 200,
      }),
    ).toEqual({
      event: "bff.proxy",
      accessToken: "[redacted]",
      refreshToken: "[redacted]",
      authorization: "[redacted]",
      cookie: "[redacted]",
      "x-bff-key": "[redacted]",
      otp: "[redacted]",
      status: 200,
    });
  });
});

describe("routeTemplate", () => {
  it("replaces record identifiers so logs never carry them", () => {
    expect(
      routeTemplate([
        "api",
        "v1",
        "students",
        "0190a6c2-7d4e-7000-8000-123456789abc",
        "guardians",
        "42",
      ]),
    ).toBe("/api/v1/students/:id/guardians/:n");
  });
});
