import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma "Pagination": a row of 32px round items. The current page sits on a
// gray fill; prev and next arrows dim at the ends.
function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn("flex", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

const itemClassName =
  "inline-flex size-8 items-center justify-center rounded-full text-body-sm font-medium text-gray-700 transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/25 aria-disabled:pointer-events-none aria-disabled:opacity-40 [&_svg]:size-4";

/**
 * A page number. Pass `render={<Link href="..." />}` for routed pages or
 * `render={<button type="button" />}` for client-side paging.
 */
function PaginationLink({
  isActive = false,
  className,
  render,
  ...props
}: useRender.ComponentProps<"a"> & { isActive?: boolean }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": isActive ? "page" : undefined,
        className: cn(
          itemClassName,
          "hover:bg-gray-25 hover:text-foreground aria-[current=page]:bg-gray-50 aria-[current=page]:text-foreground",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "pagination-link", active: isActive },
  });
}

/** Previous or next page. Set `aria-disabled` at the ends. */
function PaginationArrow({
  direction,
  className,
  render,
  ...props
}: useRender.ComponentProps<"a"> & { direction: "previous" | "next" }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-label": direction === "previous" ? "Previous page" : "Next page",
        className: cn(itemClassName, "hover:bg-gray-50 hover:text-foreground", className),
        children: direction === "previous" ? <ChevronLeftIcon /> : <ChevronRightIcon />,
      },
      props,
    ),
    render,
    state: { slot: `pagination-${direction}` },
  });
}

function PaginationPrevious(
  props: Omit<React.ComponentProps<typeof PaginationArrow>, "direction">,
) {
  return <PaginationArrow direction="previous" {...props} />;
}

function PaginationNext(props: Omit<React.ComponentProps<typeof PaginationArrow>, "direction">) {
  return <PaginationArrow direction="next" {...props} />;
}

/** Stands in for a skipped range of pages. */
function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center text-gray-500 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <MoreHorizontalIcon />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
