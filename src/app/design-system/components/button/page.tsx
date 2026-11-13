import { ComponentDocPage } from "@/features/design-system/components/docs/component-doc-page";
import { ButtonExamples } from "@/features/design-system/examples/button";
import { docMetadata } from "@/features/design-system/lib/registry";

export const metadata = docMetadata("button");

export default function Page() {
  return (
    <ComponentDocPage
      slug="button"
      importCode={`import { Button } from "@/components/ui/button";`}
      examples={<ButtonExamples />}
      usage={{
        whenToUse: [
          "primary for the main action on a screen, form or panel (Apply, Save, New campaign); primary-subtle and primary-ghost for supporting actions next to it.",
          "secondary (black) for neutral confirmations; secondary-subtle and secondary-ghost for Cancel, Back and other low-emphasis actions.",
          "destructive-subtle or destructive-ghost for Delete, Remove and Revoke.",
          "special almost never. It is genuinely special: mint is Tomoji's reserved color for a premium product or tier, if one ships. Think of how DoorDash is red and black everywhere, but DashPass members see blue on DashPass-specific screens. Use special only on those premium-specific screens and actions (upgrading, or a perk only that tier gets), never to make an ordinary action stand out.",
        ],
        do: [
          "Use md for page and form actions, often full width; sm in toolbars, table rows and cards.",
          "Pair one solid button with subtle or ghost buttons so the main action is obvious.",
          "Use a leading icon to clarify the action (RiAddLine for create, RiDeleteBinLine for delete) and a trailing RiArrowRightLine for moving forward.",
        ],
        dont: [
          "Don't use special for a screen's main action, a launch moment or anything you just want to pop. Reach for primary. If special shows up everywhere, mint stops meaning anything when there is finally a premium tier to point to.",
          "Don't put more than one special button on a screen, even a premium one.",
          "Don't use a solid red button — destructive actions are subtle or ghost only.",
        ],
      }}
      props={[
        {
          component: "Button",
          rows: [
            {
              name: "variant",
              type: '"special" | "primary" | "primary-subtle" | "primary-ghost" | "secondary" | "secondary-subtle" | "secondary-ghost" | "destructive-subtle" | "destructive-ghost" | "link"',
              default: '"primary"',
              description:
                "Matches the Figma layer names. special is reserved for a premium tier; see Usage. link is a text-only blue action for inline use.",
            },
            {
              name: "size",
              type: '"md" | "default" | "sm" | "icon" | "icon-sm"',
              default: '"default"',
              description:
                "md and default are 16 × 12 padding (45px tall); sm is 12 × 6 (33px tall). Text is 16px in all. icon and icon-sm are square, for icon-only buttons.",
            },
            {
              name: "icon",
              type: "IconComponent",
              description:
                "Leading Remix icon, e.g. icon={RiAddLine}. Drawn at 16px in the text color.",
            },
            {
              name: "trailingIcon",
              type: "IconComponent",
              description: "Trailing Remix icon, e.g. trailingIcon={RiArrowRightLine}.",
            },
            {
              name: "fullWidth",
              type: "boolean",
              default: "false",
              description: "Stretch to the container width.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Fades the button and turns off hover.",
            },
            {
              name: "type",
              type: '"button" | "submit" | "reset"',
              default: '"button"',
              description: "The native button type.",
            },
            {
              name: "render",
              type: "ReactElement",
              description:
                "Renders another element, such as a link, with the button's styling. buttonVariants({ variant, size }) gives the same classes for elements Button can't wrap.",
            },
          ],
        },
      ]}
      names={[
        "button",
        "cta",
        "call to action",
        "action",
        "submit",
        "apply button",
        "delete button",
        "link button",
        "text button",
        "special button",
      ]}
    />
  );
}
