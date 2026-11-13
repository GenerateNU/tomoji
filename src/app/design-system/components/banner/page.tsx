import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { BannerExamples } from "@/features/design-system/examples/banner";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("banner");

export default function Page() {
  return (
    <ComponentDocPage
      slug="banner"
      importCode={'import { Banner } from "@/components/banner";'}
      examples={<BannerExamples />}
      usage={{
        whenToUse: [
          "Persistent page-level messages: an earnings milestone, a payout reminder, a disconnected account.",
        ],
        do: [
          "Pair an error banner with the action that fixes it (Reconnect).",
          "Let people dismiss banners that aren't blocking.",
        ],
        dont: [
          "Don't stack more than two banners.",
          "Don't use a banner to confirm something just done — use a Toast.",
        ],
      }}
      props={[
        {
          component: "Banner",
          rows: [
            {
              name: "tone",
              type: '"success" | "neutral" | "error"',
              default: '"success"',
              description: "Background, icon and action color.",
            },
            { name: "children", type: "ReactNode", description: "The message." },
            {
              name: "icon",
              type: "IconComponent",
              description: "Defaults to RiThumbUpLine, RiInformationLine or RiErrorWarningLine.",
            },
            {
              name: "actionLabel",
              type: "string",
              description:
                "Small ghost Button in the tone color (primary, secondary or destructive ghost).",
            },
            { name: "onAction", type: "() => void", description: "Action click." },
            { name: "onClose", type: "() => void", description: "Shows the × button." },
          ],
        },
      ]}
      names={["banner", "alert", "callout", "notice", "inline message", "announcement", "warning"]}
    />
  );
}
