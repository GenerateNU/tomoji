import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { ToastExamples } from "@/features/design-system/examples/toast";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("toast");

export default function Page() {
  return (
    <ComponentDocPage
      slug="toast"
      importCode={'import { Toast } from "@/components/toast";'}
      examples={<ToastExamples />}
      usage={{
        whenToUse: [
          "Confirming an action just taken (application sent, items archived).",
          "Reporting a failure the person can retry.",
        ],
        do: ["Name the thing acted on in entity.", "Offer Undo after reversible bulk actions."],
        dont: ["Don't use a toast for information people must act on later — use a Banner."],
      }}
      props={[
        {
          component: "Toast",
          rows: [
            { name: "prefix", type: "string", description: "Text before the entity, gray-700." },
            { name: "entity", type: "string", description: "The affected item, black medium." },
            { name: "suffix", type: "string", description: "Text after the entity." },
            {
              name: "children",
              type: "ReactNode",
              description: "Free-form message instead of prefix / entity / suffix.",
            },
            {
              name: "tone",
              type: '"success" | "neutral" | "error"',
              default: '"success"',
              description: "Icon Container tone.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description: "Overrides the tone's icon.",
            },
            {
              name: "actionLabel",
              type: "string",
              description: "Small secondary-subtle button.",
            },
            { name: "onAction", type: "() => void", description: "Action click." },
            { name: "onClose", type: "() => void", description: "Shows the × button." },
          ],
        },
      ]}
      names={["toast", "snackbar", "notification", "confirmation", "flash message", "undo"]}
    />
  );
}
