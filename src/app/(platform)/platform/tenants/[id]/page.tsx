// One school on the platform: its status, and suspend or reactivate it (ADR 0027).
import { PlatformPage } from "@/features/platform/PlatformPage";
import { PlatformTenantView } from "@/features/platform/PlatformViews";

export default async function PlatformTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PlatformPage>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <PlatformTenantView id={id} />
      </div>
    </PlatformPage>
  );
}
