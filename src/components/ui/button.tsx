import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Button": Type (variant) × Tone × State. Hover and pressed tint the
// fill (or fade the text, for ghost) rather than swapping colors.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary and ghost dim further when disabled, matching Figma.
        default: "",
        secondary: "disabled:opacity-50",
        ghost: "disabled:opacity-40",
        link: "text-primary underline-offset-4 hover:underline disabled:opacity-50",
      },
      tone: {
        default: "",
        destructive: "",
      },
      size: {
        sm: "h-8 gap-1 px-2.5 text-body-sm",
        default: "h-9 gap-1.5 px-3 text-body",
        lg: "h-10 gap-2 px-4 text-body",
        "icon-sm": "size-8",
        icon: "size-9",
        "icon-lg": "size-10",
      },
    },
    compoundVariants: [
      {
        variant: "default",
        tone: "default",
        className:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),white_10%)] active:bg-[color-mix(in_oklch,var(--primary),white_20%)] disabled:opacity-40",
      },
      {
        variant: "default",
        tone: "destructive",
        className:
          "bg-destructive text-white hover:bg-[color-mix(in_oklch,var(--destructive),black_10%)] active:bg-[color-mix(in_oklch,var(--destructive),black_20%)] disabled:opacity-50",
      },
      {
        variant: "secondary",
        className:
          "bg-secondary hover:bg-[color-mix(in_oklch,var(--secondary),black_10%)] active:bg-[color-mix(in_oklch,var(--secondary),black_20%)]",
      },
      { variant: "secondary", tone: "default", className: "text-secondary-foreground" },
      { variant: "secondary", tone: "destructive", className: "text-red-700" },
      {
        variant: "ghost",
        tone: "default",
        className: "text-foreground hover:text-foreground/80 active:text-foreground/60",
      },
      {
        variant: "ghost",
        tone: "destructive",
        className: "text-red-700 hover:text-red-700/80 active:text-red-700/60",
      },
    ],
    defaultVariants: {
      variant: "default",
      tone: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  tone = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, tone, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
