import type { ReactNode } from "react";
import { getFoundation, type FoundationSlug } from "@/features/design-system/lib/registry";
import { PageHeader } from "./page-header";

export function FoundationDocPage({
  slug,
  children,
}: {
  slug: FoundationSlug;
  children: ReactNode;
}) {
  const entry = getFoundation(slug);

  return (
    <div className="max-w-5xl">
      <PageHeader eyebrow="Foundations" title={entry.name} summary={entry.summary} />
      {children}
    </div>
  );
}
