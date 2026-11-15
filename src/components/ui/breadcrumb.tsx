import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { RiMoreLine } from "@remixicon/react";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

// Figma "Breadcrumbs": grey links separated by slashes, current page in black.
function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav aria-label="breadcrumb" data-slot="breadcrumb" className={cn(className)} {...props} />
  );
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-2 text-body font-normal wrap-break-word text-gray-500",
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-2", className)}
      {...props}
    />
  );
}

function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "inline-flex items-center gap-2 rounded-xs transition-colors hover:text-gray-950",
          focusRing,
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  });
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("inline-flex items-center gap-2 font-medium text-gray-950", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("text-gray-300 [&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? "/"}
    </li>
  );
}

function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}
    >
      <RiMoreLine {...iconProps} />
      <span className="sr-only">More</span>
    </span>
  );
}

type BreadcrumbItemData = {
  label: React.ReactNode;
  avatar?: React.ReactNode;
  href?: string;
  onClick?: () => void;
};

// The reference's "Breadcrumb Item". The `BreadcrumbItem` export above is the
// shadcn `<li>` wrapper, so this one is named for what it draws.
function BreadcrumbCrumb({
  label,
  avatar,
  current = false,
  href,
  onClick,
  className,
}: BreadcrumbItemData & { current?: boolean; className?: string }) {
  const classes = cn(
    "inline-flex items-center gap-2 rounded-xs text-body",
    focusRing,
    current
      ? "font-medium text-gray-950"
      : "font-normal text-gray-500 transition-colors hover:text-gray-950",
    className,
  );
  const content = (
    <>
      {avatar}
      {label}
    </>
  );
  if (current) {
    return (
      <span aria-current="page" className={classes}>
        {content}
      </span>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(classes, "cursor-pointer")}>
      {content}
    </button>
  );
}

/** A location trail from the root; the last item is the current page. */
function Breadcrumbs({ items, className }: { items: BreadcrumbItemData[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" data-slot="breadcrumbs" className={className}>
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 ? (
              <li aria-hidden className="text-body font-normal text-gray-300">
                /
              </li>
            ) : null}
            <li className="flex">
              <BreadcrumbCrumb {...item} current={index === items.length - 1} />
            </li>
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

export type { BreadcrumbItemData };
export {
  Breadcrumbs,
  BreadcrumbCrumb,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
