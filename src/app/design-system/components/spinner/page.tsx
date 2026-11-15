import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { SpinnerExamples } from "@/features/design-system/examples/spinner";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("spinner");

export default function Page() {
  return (
    <ComponentDocPage
      slug="spinner"
      importCode={'import { Spinner } from "@/components/spinner";'}
      examples={<SpinnerExamples />}
      usage={{
        whenToUse: [
          "Indeterminate waits where the layout isn't known yet: a whole panel or page loading, a modal fetching its content.",
          'Small inline waits next to a label, e.g. "Checking availability…".',
        ],
        do: [
          "Center it in the space the content will fill.",
          'Give it a specific label when the context isn\'t obvious, e.g. label="Loading applicants".',
        ],
        dont: [
          "Don't use it when the layout is known — use Skeleton so nothing jumps.",
          "Don't use it for a known percentage — use Progress Ring.",
          "Don't stack several on one screen; one spinner per loading region.",
        ],
      }}
      props={[
        {
          component: "Spinner",
          rows: [
            {
              name: "size",
              type: "16 | 20 | 24 | 32 | 40 | 48",
              default: "24",
              description: "Height of the [o] mark in px; width follows.",
            },
            {
              name: "label",
              type: "string",
              default: '"Loading"',
              description: (
                <>
                  Accessible name; the spinner has <code>role=&quot;status&quot;</code>.
                </>
              ),
            },
            {
              name: "className",
              type: "string",
              description: "Defaults to text-gray-300; a text class recolors it.",
            },
          ],
        },
      ]}
      names={[
        "spinner",
        "loader",
        "loading",
        "loading indicator",
        "activity indicator",
        "busy",
        "throbber",
        "progress indeterminate",
      ]}
    />
  );
}
