import type { ReactNode } from "react";
import { getComponent, type ComponentSlug } from "@/features/design-system/lib/registry";
import { AlsoCalled } from "./also-called";
import { CodeBlock } from "./code-block";
import { FigmaLink } from "./figma-link";
import { Guidelines, type GuidelinesProps } from "./guidelines";
import { OnThisPage } from "./on-this-page";
import { PageHeader } from "./page-header";
import { PropsTable, type PropRow } from "./props-table";
import { DocSection } from "./section";

const SECTIONS = [
  { id: "examples", label: "Examples" },
  { id: "usage", label: "Usage" },
  { id: "props", label: "Props" },
  { id: "names", label: "Also called" },
];

export function ComponentDocPage({
  slug,
  importCode,
  examples,
  usage,
  props,
  names,
}: {
  slug: ComponentSlug;
  importCode: string;
  examples: ReactNode;
  usage: GuidelinesProps;
  props: { component: string; rows: PropRow[] }[];
  names: string[];
}) {
  const entry = getComponent(slug);

  return (
    <div className="flex gap-12">
      <div className="min-w-0 flex-1">
        <PageHeader eyebrow="Component" title={entry.name} summary={entry.summary}>
          {entry.figma?.map((node) => (
            <FigmaLink key={node.nodeId} label={node.label} nodeId={node.nodeId} />
          ))}
        </PageHeader>
        <CodeBlock tone="import" code={importCode} className="mt-8 max-w-3xl" />
        <DocSection id={SECTIONS[0].id} title={SECTIONS[0].label}>
          {examples}
        </DocSection>
        <DocSection id={SECTIONS[1].id} title={SECTIONS[1].label}>
          <Guidelines {...usage} />
        </DocSection>
        <DocSection id={SECTIONS[2].id} title={SECTIONS[2].label}>
          {props.map((table) => (
            <PropsTable key={table.component} component={table.component} rows={table.rows} />
          ))}
        </DocSection>
        <DocSection
          id={SECTIONS[3].id}
          title={SECTIONS[3].label}
          description="Words that refer to this component — useful when describing a screen to Claude."
        >
          <AlsoCalled names={names} />
        </DocSection>
      </div>
      <OnThisPage items={SECTIONS} />
    </div>
  );
}
