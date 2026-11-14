import { describe, expect, it } from "vitest";
import { armFieldProblem, levelFieldProblem, wholeNumber } from "./rules";

describe("wholeNumber", () => {
  it("accepts zero and whole numbers, and refuses anything else", () => {
    expect(wholeNumber("0")).toBe(0);
    expect(wholeNumber(" 42 ")).toBe(42);
    expect(wholeNumber("-1")).toBeNull();
    expect(wholeNumber("1.5")).toBeNull();
    expect(wholeNumber("12a")).toBeNull();
    expect(wholeNumber("")).toBeNull();
    expect(wholeNumber("9007199254740993")).toBeNull();
  });
});

describe("levelFieldProblem", () => {
  const ok = { code: "JSS1", name: "Junior Secondary 1", order: "1", section: "JuniorSecondary" };
  it("passes a complete level", () => {
    for (const field of ["code", "name", "section", "order"] as const)
      expect(levelFieldProblem(field, ok)).toBeNull();
  });
  it("reports only the field that is wrong", () => {
    expect(levelFieldProblem("code", { ...ok, code: " " })).toBe("codeRequired");
    expect(levelFieldProblem("name", { ...ok, name: "" })).toBe("nameRequired");
    expect(levelFieldProblem("section", { ...ok, section: "" })).toBe("sectionRequired");
    expect(levelFieldProblem("order", { ...ok, order: "first" })).toBe("orderInvalid");
    expect(levelFieldProblem("name", { ...ok, order: "first" })).toBeNull();
    expect(levelFieldProblem("section", { ...ok, section: "Junior" })).toBe("sectionRequired");
  });
});

describe("armFieldProblem", () => {
  it("needs a name and a whole-number capacity, and reports each on its own", () => {
    expect(armFieldProblem("name", { name: "A", capacity: "30" })).toBeNull();
    expect(armFieldProblem("name", { name: "", capacity: "30" })).toBe("nameRequired");
    expect(armFieldProblem("capacity", { name: "", capacity: "-3" })).toBe("capacityInvalid");
    expect(armFieldProblem("name", { name: "A", capacity: "-3" })).toBeNull();
  });
});
