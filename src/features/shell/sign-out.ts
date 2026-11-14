// Sign-out clears everything this app holds for the user, then ends the server session.
//
// What is wiped, in order:
//   1. the server session: refresh family revoked on the API, and the four BFF cookies cleared
//      (POST /api/bff/auth/logout);
//   2. the in-memory query cache (TanStack Query), so no account data survives in memory;
//   3. the billing read-only flag.
// Later phases add their stores here (IndexedDB offline data for attendance and scores, which is
// wiped on logout per the brief). Nothing is kept in browser web storage.

import type { QueryClient } from "@tanstack/react-query";
import { CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { clearBillingSuspended } from "@/lib/api/billing-events";

export interface SignOutDeps {
  fetchImpl?: typeof fetch;
  queryClient: Pick<QueryClient, "clear">;
}

export async function signOut({ fetchImpl = fetch, queryClient }: SignOutDeps): Promise<void> {
  try {
    await fetchImpl("/api/bff/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { [CSRF_HEADER_NAME]: "1" },
      cache: "no-store",
    });
  } finally {
    queryClient.clear();
    clearBillingSuspended();
  }
}
