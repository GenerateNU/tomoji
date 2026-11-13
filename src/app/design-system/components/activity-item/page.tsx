import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { ActivityItemExamples } from "@/features/design-system/examples/activity-item";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("activity-item");

export default function Page() {
  return (
    <ComponentDocPage
      slug="activity-item"
      importCode={'import { ActivityItem } from "@/components/activity-item";'}
      examples={<ActivityItemExamples />}
      usage={{
        whenToUse: [
          "Notification panels and activity feeds.",
          "unread for new items, read once seen, warning when the creator has to act (changes requested, payout failed).",
        ],
        do: [
          "Pick an icon that names the event: RiVideoOnLine for assignments, RiCheckLine for acceptances, RiBankLine for payouts.",
          "Stack items with a 4px gap so the tints read as separate cards.",
        ],
        dont: ["Don't use warning for routine reminders — it is for things that need fixing."],
      }}
      props={[
        {
          component: "ActivityItem",
          rows: [
            {
              name: "status",
              type: '"unread" | "read" | "warning"',
              default: '"unread"',
              description: "Figma: Status. Sets the tint, icon tone and dot.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description: "Remix icon inside the IconContainer.",
            },
            { name: "title", type: "ReactNode", description: "Figma: Title." },
            { name: "description", type: "ReactNode", description: "Figma: Description." },
            { name: "timestamp", type: "ReactNode", description: "Figma: Timestamp." },
            {
              name: "showMenu",
              type: "boolean",
              default: "true",
              description: "Figma: Show Menu — the ••• button.",
            },
            {
              name: "onMenuClick",
              type: "() => void",
              description: "Called by the ••• button.",
            },
          ],
        },
      ]}
      names={[
        "activity item",
        "notification",
        "notification item",
        "activity feed",
        "inbox item",
        "alert item",
        "update",
        "feed item",
      ]}
    />
  );
}
