import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn("font-medium text-foreground underline-offset-4 hover:underline", className)}
      {...props}
    />
  );
}
