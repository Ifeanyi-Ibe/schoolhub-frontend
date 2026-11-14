import { describe, expect, it } from "vitest";
import { contractProblems } from "./contract";

const validStudent = {
  admissionNo: null,
  firstName: "Ada",
  middleName: null,
  lastName: "Okafor",
  gender: "Female",
  dateOfBirth: "2015-03-09",
  address: null,
  admittedOn: "2026-09-07",
  sessionId: "0190a6c2-0000-7000-8000-000000000001",
  classArmId: "0190a6c2-0000-7000-8000-000000000002",
  medicalNotes: null,
  specialNeedsNotes: null,
  guardians: [],
};
const KEY = "0190a6c2-7d4e-7000-8000-123456789abc";
const json = { "content-type": "application/json" };
const q = new URLSearchParams();
const check = (
  method: string,
  path: string,
  headers: Record<string, string>,
  body = "",
  search = q,
) => contractProblems(method, path, search, headers, body);

describe("contractProblems (test double, docs/openapi/v1.json)", () => {
  it("accepts a request the contract declares", () => {
    const body = JSON.stringify(validStudent);
    expect(check("POST", "/api/v1/students", { ...json, "idempotency-key": KEY }, body)).toEqual(
      [],
    );
  });

  it("refuses an operation that is not in the contract", () => {
    expect(check("GET", "/api/v1/not-real", {})[0]).toMatch(/no operation GET \/api\/v1\/not-real/);
  });

  it("requires the Idempotency-Key on an operation that declares it", () => {
    const body = JSON.stringify(validStudent);
    expect(check("POST", "/api/v1/students", json, body)).toContain(
      "missing header Idempotency-Key",
    );
  });

  it("refuses Idempotency-Key on an operation that does not declare it", () => {
    expect(check("GET", "/api/v1/me", { "idempotency-key": KEY })).toEqual([
      "Idempotency-Key sent to an operation that does not declare it",
    ]);
  });

  it("refuses a body whose content type the contract does not declare", () => {
    const body = JSON.stringify(validStudent);
    const problems = check(
      "POST",
      "/api/v1/students",
      { "content-type": "text/plain", "idempotency-key": KEY },
      body,
    );
    expect(problems[0]).toMatch(
      /content type text\/plain not declared \(expected application\/json\)/,
    );
  });

  it("refuses a body that misses a required field, and names the field", () => {
    const incomplete = { ...validStudent, lastName: undefined };
    const problems = check(
      "POST",
      "/api/v1/students",
      { ...json, "idempotency-key": KEY },
      JSON.stringify(incomplete),
    );
    expect(problems.join(" ")).toMatch(/must have required property 'lastName'/);
  });

  it("refuses a body on an operation that takes none, and a required body that is missing", () => {
    expect(check("GET", "/api/v1/me", {}, "{}")).toEqual([
      "body sent to an operation with no request body",
    ]);
    expect(check("POST", "/api/v1/students", { ...json, "idempotency-key": KEY })).toEqual([
      "request body is required",
    ]);
  });

  it("requires a required query parameter, and accepts it when present", () => {
    const id = "0190a6c2-0000-7000-8000-000000000003";
    expect(check("GET", `/api/v1/staff/${id}/assignments`, {})).toEqual([
      "missing query sessionId",
    ]);
    const withSession = new URLSearchParams({ sessionId: "0190a6c2-0000-7000-8000-000000000004" });
    expect(check("GET", `/api/v1/staff/${id}/assignments`, {}, "", withSession)).toEqual([]);
  });
});
