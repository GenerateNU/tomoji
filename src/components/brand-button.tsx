import type { ComponentProps } from "react";
import { RiExternalLinkLine } from "@remixicon/react";
import { BrandLogo, type Brand } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BrandButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "children"> & {
  brand: Brand;
  /** Button's colors: blue, black, or light gray. Logos are white on the first two. */
  variant?: "primary" | "secondary" | "secondary-subtle";
  /** The verb before the brand, e.g. "Continue with" or "View on". */
  label?: string;
  /** A leading external-link icon, for actions that leave Tomoji. */
  external?: boolean;
};

/**
 * Figma "Brand Button": a third-party action. Stripe and X read "Label [logo]";
 * Google and Apple read "[logo] Label Brand", following each brand's guidelines.
 * Brand colors appear only on the light variant.
 */
export function BrandButton({
  brand,
  variant = "secondary-subtle",
  label = "Continue with",
  external = false,
  className,
  ...props
}: BrandButtonProps) {
  const logo = <BrandLogo brand={brand} colored={variant === "secondary-subtle"} />;
  const logoFirst = brand === "google" || brand === "apple";
  return (
    <Button
      variant={variant}
      icon={external ? RiExternalLinkLine : undefined}
      className={cn("gap-2", className)}
      {...props}
    >
      {logoFirst ? (
        <>
          <span aria-hidden className="contents">
            {logo}
          </span>
          {label} {brand === "google" ? "Google" : "Apple"}
        </>
      ) : (
        <>
          {label}
          {logo}
        </>
      )}
    </Button>
  );
}
