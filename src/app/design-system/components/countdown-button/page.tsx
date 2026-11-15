import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { CountdownButtonExamples } from "@/features/design-system/examples/countdown-button";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("countdown-button");

export default function Page() {
  return (
    <ComponentDocPage
      slug="countdown-button"
      importCode={`import { CountdownButton } from "@/components/countdown-button";`}
      examples={<CountdownButtonExamples />}
      usage={{
        whenToUse: [
          'Confirmation screens that close themselves ("Submission sent"), where Done can also be clicked early.',
        ],
        do: [
          "Keep it short — 3 to 5 seconds.",
          "Change the key to restart the countdown when the screen reopens.",
        ],
        dont: ["Don't auto-confirm destructive or irreversible actions."],
      }}
      props={[
        {
          component: "CountdownButton",
          rows: [
            {
              name: "seconds",
              type: "number",
              default: "5",
              description: "Countdown length.",
            },
            {
              name: "onComplete",
              type: "() => void",
              description: "Fires once, when the timer reaches 0 or the button is clicked.",
            },
            {
              name: "onClick",
              type: "MouseEventHandler<HTMLButtonElement>",
              description:
                "Called when the button is clicked before the timer ends. Clicking also completes the countdown.",
            },
            {
              name: "showTime",
              type: "boolean",
              default: "true",
              description: 'Figma: Show Time — the "3s" after the label.',
            },
            {
              name: "paused",
              type: "boolean",
              default: "false",
              description: "Holds the timer where it is.",
            },
            {
              name: "children",
              type: "ReactNode",
              default: '"Done"',
              description: "Figma: Label.",
            },
          ],
        },
      ]}
      names={[
        "countdown button",
        "countdown timer button",
        "auto close",
        "auto dismiss",
        "done button",
        "auto confirm",
      ]}
    />
  );
}
