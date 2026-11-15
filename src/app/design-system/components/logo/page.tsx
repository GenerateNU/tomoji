import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { LogoExamples } from "@/features/design-system/examples/logo";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("logo");

export default function Page() {
  return (
    <ComponentDocPage
      slug="logo"
      importCode={'import { Logo, SpellingLogo } from "@/components/logo";'}
      examples={<LogoExamples />}
      usage={{
        whenToUse: [
          "expanded in the creator sidebar header, auth screens and marketing.",
          "collapsed in narrow rails and favicons.",
          "SpellingLogo in a sidebar header, where it types itself in and out as the sidebar collapses and peeks open.",
        ],
        do: ['Color it with a text class, e.g. className="text-gray-0" on dark backgrounds.'],
        dont: ["Don't stretch or set a width — pick a size."],
      }}
      props={[
        {
          component: "Logo",
          rows: [
            {
              name: "type",
              type: '"expanded" | "collapsed"',
              default: '"expanded"',
              description: "[ohani] or [o].",
            },
            {
              name: "size",
              type: "16 | 20 | 24 | 32 | 40 | 48 | 64 | 96 | 128",
              default: "24",
              description: "Height in px; width follows.",
            },
            {
              name: "className",
              type: "string",
              description: "Defaults to text-gray-950.",
            },
          ],
        },
        {
          component: "SpellingLogo",
          rows: [
            {
              name: "collapsed",
              type: "boolean",
              description:
                "Animates [ohani] to [o]: the right bracket slides across while h, a, n, i fade out one by one. Expanding reverses it.",
            },
            {
              name: "size",
              type: "number",
              default: "24",
              description: "Height in px; width follows.",
            },
          ],
        },
      ]}
      names={["logo", "ohani wordmark", "brand logo", "logomark", "brand mark"]}
    />
  );
}
