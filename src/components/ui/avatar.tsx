"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { Building2Icon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma "Avatar" (people, round) and "Company Avatar" (rounded square), at
// 24, 32, 40 and 48px. People's initials are blue on blue; companies' are gray.
// With no photo and no initials, a gray placeholder glyph shows instead.
const avatarVariants = cva("group/avatar relative flex shrink-0 overflow-hidden select-none", {
  variants: {
    size: {
      sm: "size-6",
      default: "size-8",
      lg: "size-10",
      xl: "size-12",
    },
    shape: {
      circle: "rounded-full bg-gray-50",
      square: "rounded-sm bg-gray-50",
    },
  },
  compoundVariants: [{ shape: "square", size: "sm", className: "rounded-xs" }],
  defaultVariants: {
    size: "default",
    shape: "circle",
  },
});

function Avatar({
  className,
  size = "default",
  shape = "circle",
  ...props
}: AvatarPrimitive.Root.Props & VariantProps<typeof avatarVariants>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      data-shape={shape}
      className={cn(avatarVariants({ size, shape }), className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, children, ...props }: AvatarPrimitive.Fallback.Props) {
  const empty = children === undefined || children === null;
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      data-empty={empty || undefined}
      className={cn(
        "flex size-full items-center justify-center bg-blue-subtle text-body-xs font-medium text-primary group-data-[shape=square]/avatar:bg-gray-50 group-data-[shape=square]/avatar:text-gray-700 data-empty:bg-gray-50 data-empty:text-gray-400",
        "group-data-[size=default]/avatar:text-body-sm group-data-[size=lg]/avatar:text-body group-data-[size=xl]/avatar:text-body-lg",
        "[&>svg]:size-3.5 group-data-[size=default]/avatar:[&>svg]:size-4.5 group-data-[size=lg]/avatar:[&>svg]:size-6 group-data-[size=xl]/avatar:[&>svg]:size-7",
        className,
      )}
      {...props}
    >
      {empty ? (
        <>
          <UserRoundIcon aria-hidden className="group-data-[shape=square]/avatar:hidden" />
          <Building2Icon aria-hidden className="hidden group-data-[shape=square]/avatar:block" />
        </>
      ) : (
        children
      )}
    </AvatarPrimitive.Fallback>
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        "group-data-[size=xl]/avatar:size-3.5 group-data-[size=xl]/avatar:[&>svg]:size-2.5",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        // Figma overlaps by 4px with a 1.5px white ring.
        "group/avatar-group flex -space-x-1 *:data-[slot=avatar]:ring-[1.5px] *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-body-sm font-medium text-gray-500 ring-[1.5px] ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 group-has-data-[size=sm]/avatar-group:text-body-xs [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge };
