// The schools on the platform (ADR 0027).
// Rendered per request: the page depends on the platform cookies and the request's locale (ADR 0027).
export const dynamic = "force-dynamic";

import { PlatformPage } from "@/features/platform/PlatformPage";
import { PlatformTenantsView } from "@/features/platform/PlatformViews";

export default async function PlatformTenantsPage() {
  return (
    <PlatformPage>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
        <PlatformTenantsView />
      </div>
    </PlatformPage>
  );
}
