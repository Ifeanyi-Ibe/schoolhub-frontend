// Academic sessions, terms, school days, rollover, and school settings against the real backend. Creates only
// e2e- data (a session, a term, a rollover session), archives the session it creates, and writes the settings
// back with the values they already hold (no change is made). The results are read back from the API.
import { randomUUID } from "node:crypto";
import { test, expect } from "../e2e/fixtures";
import { e2e } from "./support/env";
import { adminAccessToken } from "./support/admin";

const url = (p: string) => `${e2e.apiBaseUrl}${p}`;
const apiHeaders = (token: string) => ({
  "X-Bff-Key": e2e.bffKey,
  "X-Tenant": e2e.schoolSlug,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

test.describe.serial("sessions and settings against the real backend", () => {
  const tag = Date.now().toString(36);
  const sessionName = `e2e-session-${tag}`;
  // The backend limits a session name to 20 characters.
  const rolloverName = `e2e-roll-${tag}`;
  let sessionId = "";
  let termId = "";

  test("the school settings read back typed, and a write of the same values is accepted", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    for (const path of ["school-profile", "branding", "policies"]) {
      const read = await request.get(url(`/api/v1/settings/${path}`), {
        headers: apiHeaders(admin),
        failOnStatusCode: false,
      });
      expect(read.status(), `GET ${path}`).toBe(200);
      const current = (await read.json()) as Record<string, unknown>;
      // B-28: the PUT body is declared as an object. The screens send back the fields they read.
      const write = await request.put(url(`/api/v1/settings/${path}`), {
        headers: apiHeaders(admin),
        data: current,
        failOnStatusCode: false,
      });
      expect(
        write.status(),
        `PUT ${path} (same values) ${await write.text().catch(() => "")}`,
      ).toBe(200);
      const after = (await (
        await request.get(url(`/api/v1/settings/${path}`), { headers: apiHeaders(admin) })
      ).json()) as Record<string, unknown>;
      expect(after, `${path} unchanged`).toEqual(current);
    }
  });

  test("a session is created, given a term, shows its school days, and is archived", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const created = await request.post(url("/api/v1/sessions"), {
      headers: apiHeaders(admin),
      data: { name: sessionName, startsOn: "2040-09-01", endsOn: "2041-07-20" },
      failOnStatusCode: false,
    });
    expect(created.status()).toBe(201);
    sessionId = ((await created.json()) as { id: string }).id;

    const term = await request.post(url(`/api/v1/sessions/${sessionId}/terms`), {
      headers: apiHeaders(admin),
      data: {
        number: 1,
        name: "e2e first term",
        startsOn: "2040-09-01",
        endsOn: "2040-12-18",
        nextTermBegins: null,
      },
      failOnStatusCode: false,
    });
    expect(term.status()).toBe(201);
    termId = ((await term.json()) as { id: string }).id;

    const days = await request.get(url(`/api/v1/terms/${termId}/school-days`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(days.status()).toBe(200);
    const figures = (await days.json()) as { totalDays: number; schoolDays: number };
    expect(figures.totalDays).toBeGreaterThan(0);
    expect(figures.schoolDays).toBeLessThanOrEqual(figures.totalDays);

    const archived = await request.post(url(`/api/v1/sessions/${sessionId}/archive`), {
      headers: apiHeaders(admin),
      failOnStatusCode: false,
    });
    expect(archived.status()).toBe(200);
  });

  test("rollover answers the same to a repeated request with the same Idempotency-Key", async ({
    request,
  }) => {
    const admin = await adminAccessToken(request);
    const key = randomUUID();
    const body = { name: rolloverName, startsOn: "2042-09-01", endsOn: "2043-07-20" };
    const first = await request.post(url("/api/v1/academics/rollover"), {
      headers: { ...apiHeaders(admin), "Idempotency-Key": key },
      data: body,
      failOnStatusCode: false,
    });
    const second = await request.post(url("/api/v1/academics/rollover"), {
      headers: { ...apiHeaders(admin), "Idempotency-Key": key },
      data: body,
      failOnStatusCode: false,
    });
    // The backend decides whether a rollover is allowed on this school (for example, it needs a current
    // session). Whatever it answers, a repeat with the same key must not start a second session.
    const detail = await first.text();
    expect([201, 409, 422], `rollover answered ${first.status()}: ${detail}`).toContain(
      first.status(),
    );
    expect(second.status()).toBe(first.status());
    if (first.status() === 201) {
      const a = (await first.json()) as { id: string };
      const b = (await second.json()) as { id: string };
      expect(b.id).toBe(a.id);
    }
  });
});
