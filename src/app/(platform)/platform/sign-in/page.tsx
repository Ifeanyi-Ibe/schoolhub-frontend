// Platform staff sign-in (ADR 0027).
import { PlatformPage } from "@/features/platform/PlatformPage";
import { PlatformSignInView } from "@/features/platform/PlatformSignInView";

export default async function PlatformSignInPage() {
  return (
    <PlatformPage>
      <PlatformSignInView />
    </PlatformPage>
  );
}
