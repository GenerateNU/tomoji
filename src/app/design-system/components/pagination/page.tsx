import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { PaginationExamples } from "@/features/design-system/examples/pagination";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("pagination");

export default function Page() {
  return (
    <ComponentDocPage
      slug="pagination"
      importCode={`import { PaginationControl } from "@/components/ui/pagination";`}
      examples={<PaginationExamples />}
      usage={{
        whenToUse: ["Under tables and long lists that load a page at a time."],
        do: [
          "Use PaginationControl with pageCount and page; reach for Pagination, PaginationLink and the arrows only to build a custom layout.",
        ],
        dont: ["Don't paginate short lists that fit on one screen."],
      }}
      props={[
        {
          component: "PaginationControl",
          rows: [
            { name: "pageCount", type: "number", description: "Total number of pages." },
            {
              name: "page",
              type: "number",
              description: "Current page, 1-based (controlled).",
            },
            {
              name: "defaultPage",
              type: "number",
              default: "1",
              description: "Initial page when uncontrolled.",
            },
            {
              name: "onPageChange",
              type: "(page: number) => void",
              description: "Called with the new page.",
            },
          ],
        },
        {
          component: "PaginationLink",
          rows: [
            {
              name: "isActive",
              type: "boolean",
              default: "false",
              description: 'Gray-50 fill and aria-current="page".',
            },
            {
              name: "render",
              type: "ReactElement",
              description:
                'What to render: <Link href="…" /> for routed pages, <button type="button" /> for client paging.',
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description:
                "Fades the item. Buttons get the native attribute; links get aria-disabled, lose their href and leave the tab order.",
            },
            { name: "children", type: "ReactNode", description: "The page number." },
          ],
        },
        {
          component: "PaginationPrevious / PaginationNext",
          rows: [
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description:
                "Fades the arrow, e.g. prev on page 1. Links get aria-disabled and lose their href.",
            },
          ],
        },
      ]}
      names={["pagination", "pager", "page numbers", "next page", "previous page"]}
    />
  );
}
