"use client";

import { RiAddLine, RiArrowRightLine, RiDeleteBinLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Example } from "@/features/design-system/components/docs/example";

type ButtonVariant = NonNullable<React.ComponentProps<typeof Button>["variant"]>;

const GROUPS: { title: string; description: string; variants: ButtonVariant[]; label: string }[] = [
  {
    title: "Primary",
    description: "Blue, in solid, subtle and ghost weight.",
    variants: ["primary", "primary-subtle", "primary-ghost"],
    label: "Apply",
  },
  {
    title: "Secondary",
    description: "Black, in solid, subtle and ghost weight.",
    variants: ["secondary", "secondary-subtle", "secondary-ghost"],
    label: "Apply",
  },
  {
    title: "Destructive",
    description: "Red, subtle and ghost only.",
    variants: ["destructive-subtle", "destructive-ghost"],
    label: "Delete",
  },
  {
    title: "Special",
    description:
      "Mint, reserved for a premium product or tier. Use it incredibly sparingly, and only on that tier's own screens.",
    variants: ["special"],
    label: "Upgrade",
  },
];

export function ButtonExamples() {
  return (
    <>
      {GROUPS.map((group) => (
        <Example
          key={group.title}
          title={group.title}
          description={group.description}
          canvasClassName="flex-col items-stretch"
          code={group.variants
            .map(
              (variant) => `<Button variant="${variant}" fullWidth>${group.label}</Button>
<Button variant="${variant}" size="sm">${group.label}</Button>`,
            )
            .join("\n")}
        >
          {group.variants.map((variant) => (
            <div key={variant} className="flex items-center justify-center gap-6">
              <Button variant={variant} fullWidth className="max-w-78.75">
                {group.label}
              </Button>
              <div className="w-20">
                <Button variant={variant} size="sm">
                  {group.label}
                </Button>
              </div>
            </div>
          ))}
        </Example>
      ))}
      <Example
        title="With icons"
        description="Pass a Remix icon as icon (leading) or trailingIcon. It takes the button's text color."
        code={`import { RiAddLine, RiArrowRightLine, RiDeleteBinLine } from "@remixicon/react";

<Button icon={RiAddLine}>Create campaign</Button>
<Button variant="secondary" trailingIcon={RiArrowRightLine}>Next</Button>
<Button variant="primary-subtle" size="sm" icon={RiAddLine}>Add link</Button>
<Button variant="destructive-subtle" size="sm" icon={RiDeleteBinLine}>Delete</Button>`}
      >
        <Button icon={RiAddLine}>Create campaign</Button>
        <Button variant="secondary" trailingIcon={RiArrowRightLine}>
          Next
        </Button>
        <Button variant="primary-subtle" size="sm" icon={RiAddLine}>
          Add link
        </Button>
        <Button variant="destructive-subtle" size="sm" icon={RiDeleteBinLine}>
          Delete
        </Button>
      </Example>
      <Example title="Disabled" code="<Button disabled>Apply</Button>">
        <Button disabled>Apply</Button>
        <Button variant="secondary-subtle" disabled>
          Apply
        </Button>
        <Button variant="destructive-ghost" disabled>
          Delete
        </Button>
      </Example>
    </>
  );
}
