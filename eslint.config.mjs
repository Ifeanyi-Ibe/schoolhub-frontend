import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "public/sw.js",
    "public/sw.js.map",
    "public/workbox-*.js",
    "public/workbox-*.js.map",
    "src/lib/api/schema.d.ts",
    "src/lib/api/operations.generated.ts",
  ]),
  {
    rules: {
      // Forbid client-visible token storage by convention; the BFF owns tokens.
      "no-restricted-properties": [
        "error",
        {
          object: "localStorage",
          message: "Tokens and PII must not be stored in localStorage (CLAUDE.md).",
        },
        {
          object: "sessionStorage",
          message: "Tokens and PII must not be stored in sessionStorage (CLAUDE.md).",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is not allowed without a review (CLAUDE.md, security).",
        },
      ],
    },
  },
]);
