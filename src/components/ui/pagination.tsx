"use client";

import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
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

const itemClassName = cn(
  "inline-flex size-8 shrink-0 max-md:size-11 cursor-pointer items-center justify-center rounded-full text-body-sm font-medium text-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
  focusRing,
);

// Native `disabled` only exists on buttons; anything else is a link, which is
// disabled with aria-disabled, no href and no tab stop.
function disabledProps(disabled: boolean | undefined, render: React.ReactElement | unknown) {
  if (!disabled) return {};
  const isButton = React.isValidElement(render) && render.type === "button";
  return isButton
    ? { disabled: true }
    : { "aria-disabled": true as const, href: undefined, tabIndex: -1 };
}

/**
 * A page number. Pass `render={<Link href="..." />}` for routed pages or
 * `render={<button type="button" />}` for client-side paging. Pass `disabled`
 * for either form: buttons get the native attribute, links get `aria-disabled`,
 * lose their `href` and leave the tab order.
 */
function PaginationLink({
  isActive = false,
  disabled,
  className,
  render,
  ...props
}: useRender.ComponentProps<"a"> & { isActive?: boolean; disabled?: boolean }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": isActive ? "page" : undefined,
        className: cn(
          itemClassName,
          isActive
            ? "bg-gray-50 text-gray-950"
            : "not-disabled:not-aria-disabled:hover:bg-gray-25 not-disabled:not-aria-disabled:hover:text-gray-950",
          className,
        ),
      },
      props,
      disabledProps(disabled, render),
    ),
    render,
    state: { slot: "pagination-link", active: isActive },
  });
}

/** Previous or next page. Pass `disabled` at the ends. */
function PaginationArrow({
  direction,
  disabled,
  className,
  render,
  ...props
}: useRender.ComponentProps<"a"> & {
  direction: "previous" | "next";
  disabled?: boolean;
}) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-label": direction === "previous" ? "Previous page" : "Next page",
        className: cn(
          itemClassName,
          "not-disabled:not-aria-disabled:hover:bg-gray-50 not-disabled:not-aria-disabled:hover:text-gray-950",
          className,
        ),
        children:
          direction === "previous" ? (
            <RiArrowLeftSLine {...iconProps} />
          ) : (
            <RiArrowRightSLine {...iconProps} />
          ),
      },
      props,
      disabledProps(disabled, render),
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
        "flex size-8 shrink-0 items-center justify-center text-body-sm font-medium text-gray-500 max-md:size-11",
        className,
      )}
      {...props}
    >
      …
    </span>
  );
}

// Always returns 7 items once there are more than 7 pages, so the row keeps a
// constant width and the arrows stay put while paging. First and last page are
// always shown; near either end the window holds five consecutive numbers, in
// the middle it holds the current page and a neighbour each side. An ellipsis
// therefore never hides a single page.
export function pageWindow(pageCount: number, page: number): (number | "ellipsis")[] {
  if (pageCount < 1) return [];
  const current = Math.min(Math.max(page, 1), pageCount);
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", pageCount];
  if (current >= pageCount - 3) {
    return [1, "ellipsis", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", pageCount];
}

/**
 * Prev, a windowed set of page numbers, and next, as buttons. Controlled with
 * `page`; leave it out and the control tracks the page itself, starting at
 * `defaultPage`.
 */
function PaginationControl({
  pageCount,
  page,
  defaultPage = 1,
  onPageChange,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "onChange"> & {
  pageCount: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
}) {
  const [internalPage, setInternalPage] = React.useState(defaultPage);
  const current = Math.min(Math.max(page ?? internalPage, 1), Math.max(pageCount, 1));
  const go = (next: number) => {
    if (page === undefined) setInternalPage(next);
    onPageChange?.(next);
  };
  return (
    <Pagination aria-label="Pagination" className={cn("inline-flex", className)} {...props}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            render={<button type="button" />}
            disabled={current <= 1}
            onClick={() => go(current - 1)}
          />
        </PaginationItem>
        {pageWindow(pageCount, current).map((item, index) =>
          item === "ellipsis" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                render={<button type="button" />}
                isActive={item === current}
                onClick={() => go(item)}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            render={<button type="button" />}
            disabled={current >= pageCount}
            onClick={() => go(current + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export {
  Pagination,
  PaginationArrow,
  PaginationControl,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
