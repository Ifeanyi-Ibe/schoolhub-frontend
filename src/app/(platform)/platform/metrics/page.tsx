// Platform metrics (ADR 0027).
import { PlatformPage } from "@/features/platform/PlatformPage";
import { PlatformMetricsView } from "@/features/platform/PlatformViews";

export default async function PlatformMetricsPage() {
  return (
    <PlatformPage>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
        <PlatformMetricsView />
      </div>
    </PlatformPage>
  );
}
