import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { TagExamples } from "@/features/design-system/examples/tag";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("tag");

export default function Page() {
  return (
    <ComponentDocPage
      slug="tag"
      importCode={`import { Tag } from "@/components/ui/badge";`}
      examples={<TagExamples />}
      usage={{
        whenToUse: [
          "sm for statuses and attributes on cards and rows (Applied, 3/20 spots left, Waiting 6d).",
          "md for values inside fields, such as the chosen options of a multi-select (with onRemove).",
        ],
        do: [
          "Use primary for positive or in-progress statuses and destructive for deadlines and problems.",
        ],
        dont: ["Don't make tags clickable — use a Filter Chip or Button for actions."],
      }}
      props={[
        {
          component: "Tag",
          rows: [
            {
              name: "tone",
              type: '"neutral" | "primary" | "destructive"',
              default: '"neutral"',
              description: "Gray-50 / blue-subtle / red-100 fill.",
            },
            {
              name: "size",
              type: '"sm" | "md"',
              default: '"sm"',
              description: "sm has 12px text and icons; md has 14px.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description: "Leading Remix icon, e.g. icon={RiTimeLine}.",
            },
            {
              name: "onRemove",
              type: "() => void",
              description: "Shows a × button that calls this.",
            },
            {
              name: "removeLabel",
              type: "string",
              default: '"Remove {children}"',
              description: "Accessible name of the × button.",
            },
          ],
        },
      ]}
      names={["tag", "badge", "label", "status", "pill", "chip", "token"]}
    />
  );
}
