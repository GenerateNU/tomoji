import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SelectableCardExamples } from "@/features/design-system/examples/selectable-card";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("selectable-card");

export default function Page() {
  return (
    <ComponentDocPage
      slug="selectable-card"
      importCode={`import { SelectableCard } from "@/components/selectable-card";`}
      examples={<SelectableCardExamples />}
      usage={{
        whenToUse: [
          "Picking one or more reasons or options that each need a sentence of explanation, like what to change in a submission.",
        ],
        do: [
          "Stack cards with an 8px gap on a gray-25 panel.",
          "Keep titles short and put the detail in description.",
        ],
        dont: ["Don't use cards for short, single-word options — use Checkboxes or Filter Chips."],
      }}
      props={[
        {
          component: "SelectableCard",
          rows: [
            { name: "title", type: "ReactNode", description: "Body medium, gray-950." },
            {
              name: "description",
              type: "ReactNode",
              description: "Body small, gray-500.",
            },
            { name: "checked", type: "boolean", description: "Controlled state." },
            {
              name: "defaultChecked",
              type: "boolean",
              default: "false",
              description: "Initial state when uncontrolled.",
            },
            {
              name: "onCheckedChange",
              type: "(checked: boolean) => void",
              description: "Called with the new value.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the card to 40%.",
            },
            {
              name: "name / value",
              type: "string",
              description: "Passed to the hidden native checkbox.",
            },
          ],
        },
      ]}
      names={[
        "selectable card",
        "checkbox card",
        "option card",
        "choice card",
        "reason picker",
        "multi-select card",
      ]}
    />
  );
}
