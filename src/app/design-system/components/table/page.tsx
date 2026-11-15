import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { TableExamples } from "@/features/design-system/examples/table";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("table");

export default function Page() {
  return (
    <ComponentDocPage
      slug="table"
      importCode={`import {
  SortIcon,
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";`}
      examples={<TableExamples />}
      usage={{
        whenToUse: [
          "Lists of comparable records: offers, disputes, campaigns, creators.",
          "Avatar cells for the first column when rows are companies or people; custom cells for buttons, tags and progress bars.",
          'Sortable headers (sort="unsorted" plus onSort) when people need to reorder by a column.',
        ],
        do: [
          "Keep one column sorted at a time; the sorted header turns gray-950 and darkens one chevron.",
          "Put row actions (View Offer) in a trailing custom cell with a small button.",
          "Leave out the title for a bare table inside another card.",
        ],
        dont: [
          "Don't wrap cell text; long text truncates with an ellipsis.",
          "Don't add zebra stripes or vertical lines — use divider only when rows need separating.",
        ],
      }}
      props={[
        {
          component: "TableCard",
          rows: [
            {
              name: "title",
              type: "ReactNode",
              description: "Card title (body-lg-medium). Figma: Title.",
            },
            {
              name: "count",
              type: "number | string",
              description: "Shown in gray after the title as (4). Figma: Count.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "One TableHeader and a TableBody of TableRows.",
            },
          ],
        },
        {
          component: "Table",
          rows: [
            {
              name: "bare",
              type: "boolean",
              default: "false",
              description:
                "Skips the white card, for a table already inside one. Label untitled tables with aria-label.",
            },
          ],
        },
        {
          component: "TableHeader / TableRow",
          rows: [
            {
              name: "divider",
              type: "boolean",
              default: "false",
              description: "A gray-200 line underneath. Figma: Show Divider.",
            },
          ],
        },
        {
          component: "TableHead",
          rows: [
            {
              name: "sort",
              type: '"none" | "unsorted" | "ascending" | "descending"',
              default: '"none"',
              description: 'Figma: Sort. Sets aria-sort and shows the sort icon unless "none".',
            },
            {
              name: "onSort",
              type: "() => void",
              description: "Turns the label into a button. Flip the sort in your state.",
            },
            { name: "children", type: "ReactNode", description: "Column label. Figma: Label." },
          ],
        },
        {
          component: "TableCell",
          rows: [
            {
              name: "type",
              type: '"text" | "avatar" | "custom"',
              default: '"text" (or "avatar" when avatar/secondary is set)',
              description: "Figma: Type.",
            },
            {
              name: "avatar",
              type: "ReactNode",
              description: "Image for avatar cells, e.g. <CompanyAvatar size={32} />.",
            },
            {
              name: "secondary",
              type: "ReactNode",
              description: "Gray second line under the value. Figma: Secondary.",
            },
            {
              name: "star",
              type: "boolean",
              default: "false",
              description: "Outline star after the value. Figma: Show Star.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Figma: Value, or the custom content.",
            },
          ],
        },
        {
          component: "SortIcon",
          rows: [
            {
              name: "direction",
              type: '"none" | "ascending" | "descending"',
              default: '"none"',
              description: "Which chevron is dark.",
            },
          ],
        },
      ]}
      names={[
        "table",
        "data table",
        "grid",
        "list view",
        "offers table",
        "disputes table",
        "sortable table",
        "sort icon",
        "table header",
        "table row",
        "table cell",
      ]}
    />
  );
}
