import { FoundationDocPage } from "@/features/design-system/components/docs/foundation-doc-page";
import { SpacingRadiusFoundation } from "@/features/design-system/foundations/spacing-radius";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("spacing-radius");

export default function Page() {
  return (
    <FoundationDocPage slug="spacing-radius">
      <SpacingRadiusFoundation />
    </FoundationDocPage>
  );
}
