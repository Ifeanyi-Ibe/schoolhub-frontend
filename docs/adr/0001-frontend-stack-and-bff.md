# ADR 0001: Frontend stack and backend-for-frontend

Status: accepted (STEP 0). Versions are pinned in F0 after registry checks (OI-03).

## Context
A multi-tenant school system with a .NET API. Parents use low-end phones on unreliable networks. Tokens must not reach client JavaScript. Tenants resolve from the request host.

## Decision
- Next.js (App Router) with TypeScript strict, Tailwind and shadcn/ui, TanStack Query, React Hook Form with Zod, Serwist, Dexie, and next-intl, as listed in CLAUDE.md.
- **BFF:** browsers call `/api/bff/*` route handlers only. They forward to the .NET API. Tokens live in httpOnly, Secure, SameSite=Lax cookies.
- **Typed client:** generated from `docs/openapi/v1.json` by openapi-typescript and called through openapi-fetch. A CI drift check fails when the generated file is stale. No hand-written API types.
- **Tenant:** resolved from the request host. Forwarded to the API through the header agreed in B-08.
- **Server Components by default.** Client components only where interactivity needs them.

## Consequences
- The BFF is a security boundary. It carries CSRF checks, strict headers, the nonce CSP and single-flight refresh.
- Binary downloads are proxied through the BFF (B-09).
- Typed settings screens wait for the contract to declare fields (B-03).
- Some features are blocked or designed around until the backend fills gaps listed in `docs/BACKEND_GAPS.md`.
