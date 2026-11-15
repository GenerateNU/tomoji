import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { StepperExamples } from "@/features/design-system/examples/stepper";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("stepper");

export default function Page() {
  return (
    <ComponentDocPage
      slug="stepper"
      importCode={`import { Stepper } from "@/components/stepper";`}
      examples={<StepperExamples />}
      usage={{
        whenToUse: [
          "Onboarding (Connect X → Basic info → Content → Portfolio).",
          "Create New Opportunity and other multi-page forms.",
        ],
        do: [
          "Keep step names to one or two words.",
          "Set current to steps.length once everything is done.",
        ],
        dont: ["Don't use a stepper for switching between views — use Tabs."],
      }}
      props={[
        {
          component: "Stepper",
          rows: [
            { name: "steps", type: "string[]", description: "Step labels in order." },
            {
              name: "current",
              type: "number",
              description: "Zero-based index of the current step. Earlier steps are complete.",
            },
            {
              name: "className",
              type: "string",
              description: "Merged onto the list, e.g. max-w-100 to narrow it.",
            },
          ],
        },
      ]}
      names={[
        "stepper",
        "steps",
        "progress bar",
        "progress",
        "wizard",
        "multi-step",
        "onboarding progress",
      ]}
    />
  );
}
