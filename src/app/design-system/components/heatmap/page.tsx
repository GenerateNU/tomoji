import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { HeatmapExamples } from "@/features/design-system/examples/heatmap";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("heatmap");

export default function Page() {
  return (
    <ComponentDocPage
      slug="heatmap"
      importCode={`import { Heatmap } from "@/components/charts/heatmap";`}
      examples={<HeatmapExamples />}
      usage={{
        whenToUse: [
          "A measure across two dimensions, such as day of the week by hour: when an audience is active, posting streaks.",
        ],
        do: [
          "Label every row and only a few columns (every 6 hours).",
          <>
            Give <code className="font-mono text-code">columnNames</code> so tooltips read “Tue, 3
            PM”.
          </>,
        ],
        dont: [
          "Don't use it for exact comparisons between cells — the key has five steps; use a Bar List.",
        ],
      }}
      props={[
        {
          component: "Heatmap",
          rows: [
            { name: "rows", type: "string[]", description: "Row labels top to bottom." },
            {
              name: "columns",
              type: "string[]",
              description: 'Column labels; "" leaves one blank.',
            },
            { name: "values", type: "number[][]", description: "values[row][column]." },
            {
              name: "columnNames",
              type: "string[]",
              description: "Full column names for the tooltip and table.",
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
              description: "Formats values in the tooltip and table.",
            },
            {
              name: "max",
              type: "number",
              description: "Domain top. Defaults to the largest value.",
            },
          ],
        },
      ]}
      names={[
        "heatmap",
        "heat map",
        "activity grid",
        "best time to post",
        "audience activity",
        "calendar heatmap",
        "contribution grid",
      ]}
    />
  );
}
