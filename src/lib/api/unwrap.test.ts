import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./unwrap";

const res = (status: number) => new Response(null, { status });

describe("unwrap", () => {
  it("returns the data for a successful call", () => {
    expect(unwrap({ data: { id: 1 }, response: res(200) })).toEqual({ id: 1 });
  });

  it("returns undefined for a 204, which has no body", () => {
    expect(unwrap({ response: res(204) })).toBeUndefined();
  });

  it("throws an ApiError carrying the stable code and trace ID", () => {
    const body = { title: "Changed", code: "concurrency.conflict", traceId: "t-9" };
    try {
      unwrap({ error: body, response: res(409) });
      expect.unreachable("unwrap should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const problem = (err as ApiError).problem;
      expect(problem).toMatchObject({ status: 409, code: "concurrency.conflict", traceId: "t-9" });
    }
  });

  it("still throws, with a generic message, when the error body is empty", () => {
    expect(() => unwrap({ response: res(503) })).toThrow(ApiError);
  });
});
