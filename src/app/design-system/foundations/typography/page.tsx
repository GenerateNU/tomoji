import { FoundationDocPage } from "@/features/design-system/components/docs/foundation-doc-page";
import { TypographyFoundation } from "@/features/design-system/foundations/typography";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("typography");

export default function Page() {
  return (
    <FoundationDocPage slug="typography">
      <TypographyFoundation />
    </FoundationDocPage>
  );
}
