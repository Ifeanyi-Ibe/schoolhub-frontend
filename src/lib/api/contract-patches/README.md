# Contract patches

Temporary runtime-validated types for gaps the backend has not typed yet.

Rules:

1. Use only for gaps listed in `docs/BACKEND_GAPS.md`. One file per gap ID (for example `b-03-settings.ts`).
2. Each patch is a Zod schema, validated at runtime, so drift is caught instead of trusted.
3. Register it in `index.ts` with its gap ID.
4. Delete the patch when a regenerated `docs/openapi/v1.json` covers the gap, and update BACKEND_GAPS.md.
5. Never hand-write any other API type. Everything else comes from `schema.d.ts`.
