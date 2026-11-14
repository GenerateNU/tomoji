import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { BrandButtonExamples } from "@/features/design-system/examples/brand-button";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("brand-button");

export default function Page() {
  return (
    <ComponentDocPage
      slug="brand-button"
      importCode={`import { BrandButton } from "@/components/brand-button";`}
      examples={<BrandButtonExamples />}
      usage={{
        whenToUse: [
          "Sign-in stacks (Google, Apple, X) — secondary-subtle and full width.",
          "Connecting a payout account (Connect with Stripe) — primary.",
          "Links out to a creator's post (View on X) with external.",
        ],
        do: [
          "Keep the same variant for every button in a sign-in stack.",
          "Change the label to fit the action: Sign in with, Connect with, View on.",
        ],
        dont: [
          "Don't recolor the Google G or Stripe wordmark; they switch to white on dark buttons automatically.",
        ],
      }}
      props={[
        {
          component: "BrandButton",
          rows: [
            {
              name: "brand",
              type: '"stripe" | "x" | "google" | "apple"',
              description: "Figma: Brand. Google and Apple add the brand name after the label.",
            },
            {
              name: "variant",
              type: '"primary" | "secondary-subtle" | "secondary"',
              default: '"secondary-subtle"',
              description: "Figma: Style.",
            },
            {
              name: "label",
              type: "string",
              default: '"Continue with"',
              description: "Figma: Label. The verb before the brand.",
            },
            {
              name: "external",
              type: "boolean",
              default: "false",
              description: "Leading RiExternalLinkLine icon. Figma: Show Icon.",
            },
            {
              name: "fullWidth",
              type: "boolean",
              default: "false",
              description: "Stretch to the container width.",
            },
            {
              name: "...button props",
              type: 'Omit<ComponentProps<typeof Button>, "variant" | "children">',
              description: "onClick, disabled, type, render and the rest pass to Button.",
            },
          ],
        },
      ]}
      names={[
        "brand button",
        "social login",
        "sign in with google",
        "sign in with apple",
        "continue with",
        "oauth button",
        "connect with stripe",
        "stripe button",
        "x button",
        "twitter button",
        "view on x",
      ]}
    />
  );
}
