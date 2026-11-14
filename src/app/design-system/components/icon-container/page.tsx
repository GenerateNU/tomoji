import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { IconContainerExamples } from "@/features/design-system/examples/icon-container";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("icon-container");

export default function Page() {
  return (
    <ComponentDocPage
      slug="icon-container"
      importCode={'import { IconContainer } from "@/components/icon-container";'}
      examples={<IconContainerExamples />}
      usage={{
        whenToUse: [
          "The leading icon in toasts.",
          "Status markers in lists, activity feeds and empty states.",
        ],
        do: ["Swap the icon to match the message (upload, clock, bell) while keeping the tone."],
        dont: ["Don't use the error tone for anything that isn't a problem."],
      }}
      props={[
        {
          component: "IconContainer",
          rows: [
            {
              name: "tone",
              type: '"success" | "neutral" | "error"',
              default: '"success"',
              description: "Background and icon color.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description:
                "Defaults to RiCheckLine, RiInformationLine or RiErrorWarningLine by tone.",
            },
          ],
        },
      ]}
      names={["icon container", "icon box", "icon tile", "status icon", "icon badge"]}
    />
  );
}
