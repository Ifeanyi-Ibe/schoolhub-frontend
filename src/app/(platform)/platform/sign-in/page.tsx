// Platform staff sign-in (ADR 0027).
// Rendered per request: the page depends on the platform cookies and the request's locale (ADR 0027).
export const dynamic = "force-dynamic";

import { PlatformPage } from "@/features/platform/PlatformPage";
import { PlatformSignInView } from "@/features/platform/PlatformSignInView";

export default async function PlatformSignInPage() {
  return (
    <PlatformPage>
      <PlatformSignInView />
    </PlatformPage>
  );
}
