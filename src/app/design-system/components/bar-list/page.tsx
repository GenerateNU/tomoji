import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { BarListExamples } from "@/features/design-system/examples/bar-list";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("bar-list");

export default function Page() {
  return (
    <ComponentDocPage
      slug="bar-list"
      importCode={`import { BarList } from "@/components/charts/bar-list";`}
      examples={<BarListExamples />}
      usage={{
        whenToUse: [
          "Ranking named things by one measure: top posts by views, creators by earnings, platforms by reach.",
          <>
            <code className="font-mono text-code">highlight</code> when one row is the point (“You”
            among other creators) — it stays blue, the rest go gray.
          </>,
        ],
        do: ["Sort rows largest first.", "Keep it to about 10 rows; fold the tail into “Other”."],
        dont: [
          "Don't color rows by value — bar length already shows it.",
          "Don't use it for change over time; use Chart.",
        ],
      }}
      props={[
        {
          component: "BarList",
          rows: [
            {
              name: "items",
              type: "{ label: string; value: number }[]",
              description: "Rows top to bottom.",
            },
            {
              name: "highlight",
              type: "string",
              description: "Label of the emphasized row; the others turn gray.",
            },
            {
              name: "max",
              type: "number",
              description: "Domain top. Defaults to the largest value.",
            },
            {
              name: "seriesLabel",
              type: "string",
              default: '"Value"',
              description: "Measure name in the tooltip and table.",
            },
            {
              name: "format",
              type: "(value: number) => string",
              description: "Formats values at the tips, in the tooltip and table.",
            },
          ],
        },
      ]}
      names={[
        "bar list",
        "horizontal bar chart",
        "ranked bars",
        "ranking",
        "leaderboard",
        "top posts",
        "top creators",
        "breakdown",
      ]}
    />
  );
}
