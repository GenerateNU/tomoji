import { FoundationDocPage } from "@/features/design-system/components/docs/foundation-doc-page";
import { ColorsFoundation } from "@/features/design-system/foundations/colors";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("colors");

export default function Page() {
  return (
    <FoundationDocPage slug="colors">
      <ColorsFoundation />
    </FoundationDocPage>
  );
}
