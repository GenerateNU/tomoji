import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SwitchExamples } from "@/features/design-system/examples/switch";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("switch");

export default function Page() {
  return (
    <ComponentDocPage
      slug="switch"
      importCode={`import { Switch } from "@/components/ui/switch";`}
      examples={<SwitchExamples />}
      usage={{
        whenToUse: [
          "Settings that take effect immediately, such as notification and visibility preferences.",
        ],
        do: [
          "Put the switch on the right of a setting row, with a medium title and a gray description on the left.",
        ],
        dont: ["Don't use a switch inside a form that needs a Save button — use a Checkbox."],
      }}
      props={[
        {
          component: "Switch",
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
              name: "onCheckedChange",
              type: "(checked: boolean) => void",
              description: "Called with the new value.",
            },
            {
              name: "size",
              type: '"default" | "sm"',
              default: '"default"',
              description: "default is 48 × 28; sm is 36 × 20.",
            },
            {
              name: "aria-label",
              type: "string",
              description:
                "Accessible name; usually the setting title next to it. Omit when a Label points at the switch.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the switch to 40%.",
            },
          ],
        },
      ]}
      names={["switch", "toggle", "on/off", "setting toggle"]}
    />
  );
}
