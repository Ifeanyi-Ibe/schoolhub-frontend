import { describe, expect, it } from "vitest";
import {
  attributeChunk,
  decodeVlq,
  ownerOf,
  parseMappings,
  rankOwners,
} from "./bundle-analysis-lib.mjs";

describe("decodeVlq", () => {
  it("decodes signed base64 VLQ values, including continuation digits", () => {
    expect(decodeVlq("AAAA")).toEqual([0, 0, 0, 0]);
    expect(decodeVlq("AAgBC")).toEqual([0, 0, 16, 1]);
    expect(decodeVlq("D")).toEqual([-1]);
  });

  it("rejects characters outside the base64 alphabet", () => {
    expect(() => decodeVlq("A!")).toThrow(/invalid base64 VLQ/);
  });
});

describe("parseMappings", () => {
  it("tracks generated columns per line and source positions across lines", () => {
    // line 0: col 0 -> source 0; col 2 -> source 0 (relative). line 1: col 0 -> source 1.
    const lines = parseMappings("AAAA,EAAE;ACAA");
    expect(lines[0]).toEqual([
      { col: 0, src: 0 },
      { col: 2, src: 0 },
    ]);
    expect(lines[1]).toEqual([{ col: 0, src: 1 }]);
  });
});

describe("ownerOf", () => {
  it("names node_modules packages, keeping scoped names whole", () => {
    expect(ownerOf("webpack://_N_E/./node_modules/react-dom/cjs/react-dom.js")).toBe("react-dom");
    expect(ownerOf("webpack://_N_E/./node_modules/@tanstack/query-core/build/x.js")).toBe(
      "@tanstack/query-core",
    );
  });

  it("names application code by feature directory", () => {
    expect(ownerOf("webpack://_N_E/./src/features/auth/forms.tsx")).toBe("src/features/auth");
    expect(ownerOf("webpack://_N_E/./src/app/layout.tsx")).toBe("src/app");
  });
});

describe("attributeChunk", () => {
  it("attributes each span of generated text to its source and sums to the chunk length", () => {
    // "aaaBBBB": first 3 chars from source 0 (react), the rest from source 1 (src/app/x.tsx).
    const code = "aaaBBBB";
    const map = {
      sources: ["webpack://_N_E/./node_modules/react/index.js", "webpack://_N_E/./src/app/x.tsx"],
      mappings: "AAAA,GCAG",
    };
    // AAAA: col 0, source 0. GCAG: col +3, source +1.
    const owners = attributeChunk(code, map);
    expect(owners.get("react")).toBe(3);
    expect(owners.get("src/app")).toBe(4);
    const total = [...owners.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(code.length);
  });

  it("ranks owners largest first with shares", () => {
    const ranked = rankOwners(
      new Map([
        ["a", 1],
        ["b", 3],
      ]),
    );
    expect(ranked[0]).toEqual({ owner: "b", raw: 3, share: 0.75 });
  });
});
