import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { FilterChipExamples } from "@/features/design-system/examples/filter-chip";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("filter-chip");

export default function Page() {
  return (
    <ComponentDocPage
      slug="filter-chip"
      importCode={'import { FilterChip } from "@/components/filter-chip";'}
      examples={<FilterChipExamples />}
      usage={{
        whenToUse: [
          "Quick filters above a list (Applied, Starred, Jobs I'm eligible for).",
          "Category filters with counts, like notification types.",
        ],
        do: [
          "Give chips an icon in quick-filter rows; a selected chip swaps its icon for × so it reads as removable.",
          "Use count for the number of matching items.",
        ],
        dont: ["Don't mix chips with and without icons in the same row."],
      }}
      props={[
        {
          component: "FilterChip",
          rows: [
            {
              name: "selected",
              type: "boolean",
              default: "false",
              description: "Filled blue; sets aria-pressed.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description:
                "Leading 14px Remix icon, e.g. icon={RiStarLine}. Shows RiCloseLine while selected.",
            },
            {
              name: "count",
              type: "number | string",
              description: "Muted count after the label. Figma: Show Count.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the chip to 40%.",
            },
            {
              name: "onPressedChange",
              type: "(pressed: boolean) => void",
              description: "Toggle the filter here. onClick works too.",
            },
          ],
        },
      ]}
      names={["filter chip", "chip", "quick filter", "toggle chip", "pill filter", "filter pill"]}
    />
  );
}
