import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { ChartExamples } from "@/features/design-system/examples/chart";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("chart");

const code = (text: string) => <code className="font-mono text-code">{text}</code>;

export default function Page() {
  return (
    <ComponentDocPage
      slug="chart"
      importCode={`import { Chart } from "@/components/charts/line-chart";
import { LegendItem } from "@/components/charts/legend";`}
      examples={<ChartExamples />}
      usage={{
        whenToUse: [
          <>
            {code('type="line"')} for money or counts over time, with {code("todayIndex")} to split
            actual from projected.
          </>,
          <>{code('type="bar"')} for a small set of categories such as days of the week.</>,
          <>
            {code("compare")} to set the blue series against a gray context line, such as this
            campaign vs. your average.
          </>,
        ],
        do: [
          "Label only the start, Today and end of a line chart; label every bar.",
          "Pair a solid LegendItem with the actual series and a dashed one with the projection; add a context one for compare.",
          <>
            Pass {code("pointLabels")} and {code("format")} so the tooltip reads “Oct 3 · $412”.
          </>,
        ],
        dont: [
          "Don't plot more than the blue series and one gray compare series.",
          "Don't put two measures with different units on one chart.",
          "Don't color bars individually — they are always blue-primary.",
        ],
      }}
      props={[
        {
          component: "Chart",
          rows: [
            {
              name: "type",
              type: '"line" | "bar"',
              default: '"line"',
              description: "Figma: Type.",
            },
            {
              name: "values",
              type: "number[]",
              description: "One value per point or bar.",
            },
            {
              name: "todayIndex",
              type: "number",
              description:
                "Line: last actual point. Later points are the dashed projection; a gray-950 Today marker sits here.",
            },
            {
              name: "labels",
              type: "string[]",
              description: 'X labels aligned to values; "" skips one.',
            },
            {
              name: "yLabels",
              type: "string[]",
              description: "Y labels top to bottom; one gridline each.",
            },
            {
              name: "min / max",
              type: "number",
              description:
                "Domain. Defaults to 0 (bars) or the smallest value, and the largest value.",
            },
            {
              name: "legend",
              type: "ReactNode",
              description: "LegendItem elements. Figma: Legend.",
            },
            {
              name: "seriesLabel",
              type: "string",
              default: '"Value"',
              description: "Series name in the tooltip and table.",
            },
            {
              name: "compare",
              type: "{ label: string; values: number[] }",
              description: "Line: a gray context series behind the blue one.",
            },
            {
              name: "pointLabels",
              type: "string[]",
              description: "Full label per point for the tooltip and table; falls back to labels.",
            },
            {
              name: "format",
              type: "(value: number) => string",
              description: "Formats values in the tooltip and table.",
            },
          ],
        },
        {
          component: "LegendItem",
          rows: [
            {
              name: "variant",
              type: '"solid" | "dashed" | "context"',
              default: '"solid"',
              description:
                "Figma: Style. Blue square, gray dashed line, or gray line (compare series).",
            },
            { name: "children", type: "ReactNode", description: "Figma: Label." },
          ],
        },
      ]}
      names={[
        "chart",
        "graph",
        "line chart",
        "area chart",
        "bar chart",
        "earnings chart",
        "projection",
        "legend",
        "legend item",
        "plot",
        "comparison chart",
        "tooltip",
        "crosshair",
      ]}
    />
  );
}
