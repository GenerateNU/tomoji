import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Button": variants are named as in Figma. Filled buttons tint their
// fill on hover and press (white over blue and black, black over light fills);
// ghost buttons fade their text instead. Every variant dims to 40% when disabled.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40 aria-invalid:ring-4 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        special:
          "bg-special text-special-foreground hover:bg-[color-mix(in_srgb,var(--special),black_6%)] active:bg-[color-mix(in_srgb,var(--special),black_12%)]",
        primary:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary),white_10%)] active:bg-[color-mix(in_srgb,var(--primary),white_20%)]",
        "primary-subtle":
          "bg-blue-subtle text-primary hover:bg-[color-mix(in_srgb,var(--color-blue-subtle),black_6%)] active:bg-[color-mix(in_srgb,var(--color-blue-subtle),black_12%)]",
        "primary-ghost": "text-primary hover:opacity-80 active:opacity-60",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),white_10%)] active:bg-[color-mix(in_srgb,var(--secondary),white_20%)]",
        "secondary-subtle":
          "bg-gray-50 text-foreground hover:bg-[color-mix(in_srgb,var(--color-gray-50),black_6%)] active:bg-[color-mix(in_srgb,var(--color-gray-50),black_12%)]",
        "secondary-ghost": "text-foreground hover:opacity-80 active:opacity-60",
        "destructive-subtle":
          "bg-red-100 text-red-700 hover:bg-[color-mix(in_srgb,var(--color-red-100),black_6%)] active:bg-[color-mix(in_srgb,var(--color-red-100),black_12%)]",
        "destructive-ghost": "text-red-700 hover:opacity-80 active:opacity-60",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8.25 px-3 text-body",
        default: "h-11.25 px-4 text-body",
        "icon-sm": "size-8.25",
        icon: "size-11.25",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
