// Temporary contract patches (owner direction, F0).
//
// Use ONLY for the gaps listed in docs/BACKEND_GAPS.md while the backend ships typed contracts.
// Each patch lives in its own file named after its gap ID (for example b-03-settings.ts), is a Zod
// schema that is checked at runtime, and is deleted once a regenerated docs/openapi/v1.json covers
// it. Never hand-write other API types.
//
// Currently no gap needs a patch in F0. Patches are added in the phase that needs them.

export const CONTRACT_PATCHES: readonly { gap: string; description: string }[] = [];
