import { FoundationDocPage } from "@/features/design-system/components/docs/foundation-doc-page";
import { IconsFoundation } from "@/features/design-system/foundations/icons";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("icons");

export default function Page() {
  return (
    <FoundationDocPage slug="icons">
      <IconsFoundation />
    </FoundationDocPage>
  );
}
