import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { AssignmentRowExamples } from "@/features/design-system/examples/assignment-row";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("assignment-row");

export default function Page() {
  return (
    <ComponentDocPage
      slug="assignment-row"
      importCode={`import { AssignmentRow } from "@/components/assignment-row";`}
      examples={<AssignmentRowExamples />}
      usage={{
        whenToUse: [
          "Upcoming assignments lists on the creator dashboard.",
          "Any list of deliverables with a due date.",
        ],
        do: [
          "Sort overdue rows to the top.",
          "Place rows on a gray-25 panel with an 8px gap so the white rows stand out.",
        ],
        dont: ["Don't put more than one tag in a row."],
      }}
      props={[
        {
          component: "AssignmentRow",
          rows: [
            {
              name: "status",
              type: '"todo" | "submitted" | "overdue"',
              default: '"todo"',
              description:
                "Figma: Status. Gray circle / blue check / red warning, with matching tag tone.",
            },
            { name: "title", type: "ReactNode", description: "Figma: Title." },
            {
              name: "due",
              type: "ReactNode",
              description: 'Tag text: "Due in 1 day", "Submitted", "2 days overdue".',
            },
            {
              name: "onClick",
              type: "() => void",
              description: "The whole row is a button; hover tints it gray-25.",
            },
            {
              name: "href",
              type: "string",
              description:
                'Renders a link instead. Use render={<Link href="…" />} for client navigation.',
            },
          ],
        },
      ]}
      names={[
        "assignment row",
        "assignment",
        "task row",
        "to do",
        "todo item",
        "deliverable",
        "upcoming assignments",
        "due date row",
      ]}
    />
  );
}
