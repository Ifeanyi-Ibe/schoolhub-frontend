import { describe, expect, it } from "vitest";
import { parseApiProblem, problemDetailsForCopy } from "./problem";

describe("parseApiProblem", () => {
  it("reads a full ProblemDetails body, including code, traceId and field errors", () => {
    const p = parseApiProblem(422, {
      type: "https://schoolhub/errors/students",
      title: "Duplicate admission number",
      status: 422,
      detail: "Admission number is taken.",
      instance: "/api/v1/students",
      code: "students.duplicate_admission_no",
      traceId: "00-abc-def-01",
      errors: { admissionNo: ["Already used in this school"] },
    });
    expect(p).toEqual({
      status: 422,
      type: "https://schoolhub/errors/students",
      title: "Duplicate admission number",
      detail: "Admission number is taken.",
      instance: "/api/v1/students",
      code: "students.duplicate_admission_no",
      traceId: "00-abc-def-01",
      errors: { admissionNo: ["Already used in this school"] },
    });
  });

  it("falls back to the HTTP status and a generic message when the body is the contract's bare ProblemDetails", () => {
    const p = parseApiProblem(409, {
      type: "about:blank",
      title: null,
      status: null,
      detail: null,
    });
    expect(p.status).toBe(409);
    expect(p.title).toMatch(/changed while you were working/i);
    expect(p.code).toBeNull();
    expect(p.traceId).toBeNull();
    expect(p.errors).toBeNull();
  });

  it("never throws on an unexpected body (HTML, arrays, numbers)", () => {
    expect(parseApiProblem(500, "<html>oops</html>").title).toBe("Something went wrong.");
    expect(parseApiProblem(500, [1, 2]).status).toBe(500);
    expect(parseApiProblem(503, null).status).toBe(503);
  });

  it("accepts a single message string for a field and normalises it to an array", () => {
    const p = parseApiProblem(400, { errors: { phone: "Enter a valid number" } });
    expect(p.errors).toEqual({ phone: ["Enter a valid number"] });
  });

  it("uses the body status when it is numeric text", () => {
    expect(parseApiProblem(400, { status: "422" }).status).toBe(422);
  });
});

describe("problemDetailsForCopy", () => {
  it("includes status, code and trace ID, and nothing else", () => {
    const text = problemDetailsForCopy(
      parseApiProblem(409, {
        code: "concurrency.conflict",
        traceId: "t-1",
        detail: "secret body text",
      }),
    );
    expect(text).toContain("Status: 409");
    expect(text).toContain("Code: concurrency.conflict");
    expect(text).toContain("Trace: t-1");
    expect(text).not.toContain("secret body text");
  });
});
