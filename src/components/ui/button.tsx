import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

// Figma "Button": variants are named as in Figma. Filled buttons tint their
// fill on hover and press with a gradient overlay (white over blue and black,
// black over light fills); ghost buttons fade instead. Every variant dims to
// 40% when disabled. The overlay selectors use `not-disabled` rather than
// `enabled` so buttons rendered as links keep their hover and press states.
const overlayOnDark =
  "not-disabled:hover:bg-[linear-gradient(rgba(255,255,255,0.1),rgba(255,255,255,0.1))] not-disabled:active:bg-[linear-gradient(rgba(255,255,255,0.2),rgba(255,255,255,0.2))]";
const overlayOnLight =
  "not-disabled:hover:bg-[linear-gradient(rgba(0,0,0,0.06),rgba(0,0,0,0.06))] not-disabled:active:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]";
const ghostFade = "not-disabled:hover:opacity-80 not-disabled:active:opacity-60";

const buttonVariants = cva(
  cn(
    "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap transition-[background-image,opacity] select-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:ring-4 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    focusRing,
  ),
  {
    variants: {
      variant: {
        special: cn("bg-special text-special-foreground", overlayOnLight),
        primary: cn("bg-primary text-primary-foreground", overlayOnDark),
        "primary-subtle": cn("bg-blue-subtle text-primary", overlayOnLight),
        "primary-ghost": cn("text-primary", ghostFade),
        secondary: cn("bg-secondary text-secondary-foreground", overlayOnDark),
        "secondary-subtle": cn("bg-gray-50 text-foreground", overlayOnLight),
        "secondary-ghost": cn("text-foreground", ghostFade),
        "destructive-subtle": cn("bg-red-100 text-red-700", overlayOnLight),
        "destructive-ghost": cn("text-red-700", ghostFade),
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8.25 px-3 text-body",
        default: "h-11.25 px-4 text-body",
        md: "h-11.25 px-4 text-body",
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
  icon: Icon,
  trailingIcon: TrailingIcon,
  fullWidth,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    icon?: IconComponent;
    trailingIcon?: IconComponent;
    fullWidth?: boolean;
  }) {
  // Only replace children when an icon is present, so `render` elements that
  // carry their own content keep working.
  const withIcons =
    Icon || TrailingIcon
      ? {
          children: (
            <>
              {Icon ? <Icon {...iconProps} /> : null}
              {props.children}
              {TrailingIcon ? <TrailingIcon {...iconProps} /> : null}
            </>
          ),
        }
      : null;
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }), fullWidth && "w-full")}
      {...props}
      {...withIcons}
    />
  );
}

export { Button, buttonVariants };
