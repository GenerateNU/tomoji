import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { CheckboxExamples } from "@/features/design-system/examples/checkbox";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("checkbox");

export default function Page() {
  return (
    <ComponentDocPage
      slug="checkbox"
      importCode={`import { Checkbox, CheckboxIndicator } from "@/components/ui/checkbox";`}
      examples={<CheckboxExamples />}
      usage={{
        whenToUse: [
          "Independent on/off choices in a list, like notification channels.",
          "indeterminate on a parent row when only some of its children are checked.",
          "CheckboxIndicator (the box alone) inside rows that already handle the click: menu items, selectable cards.",
        ],
        do: [
          "Indent child rows by 24px under an indeterminate parent.",
          "Keep the label clickable — wrap the Checkbox and its text in one label element.",
        ],
        dont: ["Don't use a checkbox for a setting that applies instantly — use a Switch."],
      }}
      props={[
        {
          component: "Checkbox",
          rows: [
            {
              name: "checked",
              type: "boolean",
              description: "Controlled state.",
            },
            {
              name: "defaultChecked",
              type: "boolean",
              default: "false",
              description: "Initial state when uncontrolled.",
            },
            {
              name: "indeterminate",
              type: "boolean",
              default: "false",
              description: "Draws a white dash on a blue box. Clicking it checks it.",
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
              description: "Fades the box to 40%.",
            },
            {
              name: "name / value / id / aria-label",
              type: "string",
              description: "Passed to the native input.",
            },
          ],
        },
        {
          component: "CheckboxIndicator",
          rows: [
            {
              name: "checked",
              type: 'boolean | "indeterminate"',
              default: "false",
              description: "Which box to draw.",
            },
            {
              name: "indeterminate",
              type: "boolean",
              default: "false",
              description: 'Draws the dash. Same as checked="indeterminate".',
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the box to 40%.",
            },
            {
              name: "interactive",
              type: "boolean",
              default: "true",
              description: "Hover styles follow the nearest parent with the group class.",
            },
            {
              name: "previewOnHover",
              type: "boolean",
              default: "false",
              description: "When unchecked, shows a gray-200 check on parent hover.",
            },
          ],
        },
      ]}
      names={[
        "checkbox",
        "check box",
        "tick box",
        "indeterminate",
        "select all",
        "multi-select option",
      ]}
    />
  );
}
