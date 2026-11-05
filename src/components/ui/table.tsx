import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma "Table": grey header labels over a hairline, unruled rows, 20px between
// columns. Set column widths on TableHead (e.g. w-80) with a table-fixed layout.
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-top text-left text-body", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
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
        "py-2 pr-5 text-left align-middle font-medium whitespace-nowrap text-muted-foreground last:pr-0",
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
        "py-3 pr-5 align-middle font-medium whitespace-nowrap text-foreground last:pr-0",
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

/** Header label that sorts its column. The sorted column's label turns black. */
function TableSortButton({
  direction,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { direction?: "ascending" | "descending" }) {
  const Icon =
    direction === "ascending"
      ? ChevronUpIcon
      : direction === "descending"
        ? ChevronDownIcon
        : ChevronsUpDownIcon;
  return (
    <button
      type="button"
      data-slot="table-sort-button"
      data-sorted={direction ? "" : undefined}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 font-medium outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-sorted:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <Icon aria-hidden />
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
