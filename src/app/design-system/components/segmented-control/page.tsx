import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SegmentedControlExamples } from "@/features/design-system/examples/segmented-control";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("segmented-control");

export default function Page() {
  return (
    <ComponentDocPage
      slug="segmented-control"
      importCode={`import { SegmentedControl, Segment } from "@/components/ui/segmented-control";`}
      examples={<SegmentedControlExamples />}
      usage={{
        whenToUse: [
          "Switching between a few views of the same content: Live / Scheduled / Paused, Week / Month / Quarter / Year.",
          "Icon segments for grid / list view toggles.",
        ],
        do: [
          "Keep to two to five short segments.",
          "Use all text or all icon segments in one control.",
        ],
        dont: ["Don't use it for navigation between pages — use Tabs."],
      }}
      props={[
        {
          component: "SegmentedControl",
          rows: [
            {
              name: "value",
              type: "string",
              description: "Selected segment value (controlled).",
            },
            {
              name: "defaultValue",
              type: "string",
              description: "Initial value when uncontrolled.",
            },
            {
              name: "onChange",
              type: "(value: string) => void",
              description: "Called with the selected segment's value.",
            },
            { name: "children", type: "ReactNode", description: "Segment elements." },
          ],
        },
        {
          component: "Segment",
          rows: [
            { name: "value", type: "string", description: "Identifies the segment." },
            {
              name: "label",
              type: "string",
              description: "Visible text, or the accessible name and tooltip of an icon segment.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description: "Makes it an icon segment, e.g. icon={RiFunctionLine}.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the segment to 40%.",
            },
          ],
        },
      ]}
      names={[
        "segmented control",
        "segment",
        "toggle group",
        "view switcher",
        "tabs",
        "button group",
        "grid list toggle",
      ]}
    />
  );
}
