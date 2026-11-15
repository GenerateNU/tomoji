import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { TabsExamples } from "@/features/design-system/examples/tabs";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("tabs");

export default function Page() {
  return (
    <ComponentDocPage
      slug="tabs"
      importCode={`import { Tabs, TabsList, TabsTrigger, TabsCount, TabsContent } from "@/components/ui/tabs";`}
      examples={<TabsExamples />}
      usage={{
        whenToUse: [
          "Switching between views of the same page, such as Applications / Offers / Archived.",
          "Settings pages split into sections (Creators / Company Seats / Tomoji Admin).",
        ],
        do: [
          "Add counts when they help people decide where to go next.",
          "Keep labels short — one or two words.",
        ],
        dont: [
          "Don't use tabs for steps in a flow — use the Stepper.",
          "Don't nest tabs inside tabs.",
        ],
      }}
      props={[
        {
          component: "Tabs",
          rows: [
            { name: "value", type: "string", description: "Selected tab value (controlled)." },
            {
              name: "defaultValue",
              type: "string",
              description: "Initial value when uncontrolled.",
            },
            {
              name: "onValueChange",
              type: "(value: string) => void",
              description: "Called with the selected tab's value.",
            },
            {
              name: "orientation",
              type: '"horizontal" | "vertical"',
              default: '"horizontal"',
              description: "Vertical stacks the triggers and drops the blue indicator.",
            },
          ],
        },
        {
          component: "TabsTrigger",
          rows: [
            { name: "value", type: "string", description: "Identifies the tab and its panel." },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the tab to 40% and skips it.",
            },
          ],
        },
        {
          component: "TabsCount",
          rows: [
            {
              name: "children",
              type: "ReactNode",
              description: "Gray count after the label, e.g. 31.",
            },
          ],
        },
        {
          component: "TabsContent",
          rows: [
            {
              name: "value",
              type: "string",
              description: "The tab this panel belongs to; only the selected panel shows.",
            },
          ],
        },
      ]}
      names={[
        "tabs",
        "tab",
        "tab bar",
        "segmented tabs",
        "underline tabs",
        "view switcher",
        "section switcher",
      ]}
    />
  );
}
