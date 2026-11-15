import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { StatTileExamples } from "@/features/design-system/examples/stat-tile";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("stat-tile");

export default function Page() {
  return (
    <ComponentDocPage
      slug="stat-tile"
      importCode={`import { StatTile } from "@/components/stat-tile";`}
      examples={<StatTileExamples />}
      usage={{
        whenToUse: [
          "Rows of headline numbers: post performance, earnings dashboards.",
          "horizontal when a single stat sits in a narrow row; vertical in grids.",
        ],
        do: [
          'Use direction "up" for good changes and "down" for bad ones.',
          "Keep tiles in a row the same layout and width.",
        ],
        dont: ["Don't put sentences in value — keep it a short number or amount."],
      }}
      props={[
        {
          component: "StatTile",
          rows: [
            {
              name: "layout",
              type: '"horizontal" | "vertical"',
              default: '"vertical"',
              description: "Figma: Layout.",
            },
            { name: "label", type: "ReactNode", description: "Figma: Label." },
            { name: "value", type: "ReactNode", description: "Figma: Value (heading-md)." },
            {
              name: "icon",
              type: "ReactNode",
              description: "Leading icon, e.g. a 16px Remix icon. Figma: Show Icon.",
            },
            {
              name: "trend",
              type: '{ text: string; direction: "up" | "down" }',
              description:
                "Small tag next to the value, e.g. +12%. Up is blue, down is red, and screen readers hear the direction. Figma: Show Trend.",
            },
          ],
        },
      ]}
      names={[
        "stat tile",
        "stat",
        "metric",
        "kpi",
        "number tile",
        "stat card",
        "metric card",
        "post performance",
        "big number",
      ]}
    />
  );
}
