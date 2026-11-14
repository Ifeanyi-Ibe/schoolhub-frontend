import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";
import {
  APP_NAMESPACES,
  AUTH_NAMESPACES,
  pickNamespaces,
  SHARED_NAMESPACES,
} from "./client-namespaces";

describe("client message namespaces", () => {
  it("sends each area exactly what it reads, and nothing dev-only", () => {
    const shared = pickNamespaces(messages, SHARED_NAMESPACES);
    const auth = pickNamespaces(messages, AUTH_NAMESPACES);
    const app = pickNamespaces(messages, APP_NAMESPACES);
    expect(Object.keys(auth)).toEqual(expect.arrayContaining(["auth", "retry"]));
    expect(app).not.toHaveProperty("auth");
    expect(auth).not.toHaveProperty("shell");
    expect(shared).not.toHaveProperty("styleguide");
    expect(shared).not.toHaveProperty("errors");
  });
});
