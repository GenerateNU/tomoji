import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { ProgressRingExamples } from "@/features/design-system/examples/progress-ring";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("progress-ring");

export default function Page() {
  return (
    <ComponentDocPage
      slug="progress-ring"
      importCode={`import { ProgressRing } from "@/components/progress-ring";`}
      examples={<ProgressRingExamples />}
      usage={{
        whenToUse: [
          "Showing how complete something is: profile setup, onboarding, campaign budget at a glance.",
        ],
        do: ["Use md (56px) beside a title and description; sm (40px) in dense rows."],
        dont: ["Don't use it for indeterminate loading — it always shows a real value."],
      }}
      props={[
        {
          component: "ProgressRing",
          rows: [
            {
              name: "value",
              type: "number",
              description: "0–100, clamped. Rounded for the label and aria-valuenow.",
            },
            {
              name: "label",
              type: "string",
              description: 'What is progressing, for screen readers, e.g. "Profile completion".',
            },
            {
              name: "size",
              type: '"sm" | "md"',
              default: '"sm"',
              description: "sm 40px / 3px ring, md 56px / 4px ring.",
            },
            {
              name: "showLabel",
              type: "boolean",
              default: "true",
              description: "Shows the percentage in the middle. Figma: Show Label.",
            },
          ],
        },
      ]}
      names={[
        "progress ring",
        "progress circle",
        "circular progress",
        "donut",
        "completion percentage",
        "ring",
        "profile completion",
      ]}
    />
  );
}
