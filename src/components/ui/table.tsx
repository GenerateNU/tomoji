import * as React from "react";
import { cn } from "@/lib/utils";

// Figma "Table": a white card with gray header labels, unruled rows, and 20px
// between columns. Set column widths on TableHead (e.g. w-80) with a
// table-fixed layout; cells truncate long text with an ellipsis, so give columns
// that must stay whole, like dates, a fixed width. Add `border-b` to rows for a
// dense, ruled table.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto rounded-lg bg-card p-6 shadow-card"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-top text-left text-body-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-border font-medium", className)}
      {...props}
    />
  );
}

/** Rows are unruled; add `border-b` for a ruled table. */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("transition-colors data-[state=selected]:bg-muted", className)}
      {...props}
    />
  );
}

/** A sortable column wraps its label in TableSortButton and sets `aria-sort`. */
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "truncate py-2 pr-5 text-left align-middle text-body-sm font-medium text-muted-foreground last:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "truncate py-3 pr-5 align-middle text-body-sm text-foreground last:pr-0",
        className,
      )}
      {...props}
    />
  );
}

/** The table's title, e.g. "Offers (4)", shown above the header. */
function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("pb-4 text-left text-body-lg font-medium text-foreground", className)}
      {...props}
    />
  );
}

/**
 * Figma "Sort Icon": both chevrons in gray, with the sorted direction's
 * chevron in black.
 */
function SortIcon({ direction }: { direction?: "ascending" | "descending" }) {
  return (
    <svg
      aria-hidden
      data-slot="table-sort-icon"
      data-direction={direction ?? "none"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-400"
    >
      <path
        d="m7 9 5-5 5 5"
        className={direction === "ascending" ? "text-foreground" : undefined}
      />
      <path
        d="m7 15 5 5 5-5"
        className={direction === "descending" ? "text-foreground" : undefined}
      />
    </svg>
  );
}

/** Header label that sorts its column. The sorted column's label turns black. */
function TableSortButton({
  direction,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { direction?: "ascending" | "descending" }) {
  return (
    <button
      type="button"
      data-slot="table-sort-button"
      data-sorted={direction ? "" : undefined}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 font-medium outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25 data-sorted:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SortIcon direction={direction} />
    </button>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableSortButton,
};
