import * as React from "react";
import { RiStarLine } from "@remixicon/react";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

// Figma "Table": a white card with gray header labels, unruled rows, and 20px
// between columns. Cells truncate long text with an ellipsis under the
// table-fixed layout, so set column widths on TableHead (e.g. w-80) and give
// columns that must stay whole, like dates, a fixed width. Add `divider` to
// the header and rows for a ruled table.
type SortDirection = "ascending" | "descending";

const cardClassName = "relative w-full overflow-x-auto rounded-lg bg-gray-0 p-6 shadow-card";

/** A table inside a white card. Pass `bare` when a TableCard already supplies the card. */
function Table({
  className,
  bare = false,
  ...props
}: React.ComponentProps<"table"> & { bare?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className={bare ? "relative w-full overflow-x-auto" : cardClassName}
    >
      <table
        data-slot="table"
        className={cn("w-full table-fixed border-collapse text-left text-body-sm", className)}
        {...props}
      />
    </div>
  );
}

/**
 * A white card with a title and count above a table, e.g. "Offers (4)".
 * `className` styles the card; other props go to the table.
 */
function TableCard({
  title,
  count,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"table">, "title"> & {
  title: React.ReactNode;
  /** Shown in gray after the title, as (4). */
  count?: number | string;
}) {
  const titleId = React.useId();
  return (
    <div data-slot="table-card" className={cn("flex flex-col gap-4", cardClassName, className)}>
      <div
        id={titleId}
        className="flex items-center gap-1.5 text-body-lg font-medium text-gray-950"
      >
        {title}
        {count !== undefined && <span className="text-gray-500">({count})</span>}
      </div>
      <Table bare aria-labelledby={titleId} {...props}>
        {children}
      </Table>
    </div>
  );
}

/** Wraps its cells in the header row. `divider` draws a gray-200 line underneath. */
function TableHeader({
  className,
  divider = false,
  children,
  ...props
}: React.ComponentProps<"thead"> & { divider?: boolean }) {
  return (
    <thead data-slot="table-header" className={className} {...props}>
      <tr className={cn(divider && "border-b border-gray-200")}>{children}</tr>
    </thead>
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

/** Rows are unruled; add `divider` for a gray-200 line underneath. */
function TableRow({
  className,
  divider = false,
  ...props
}: React.ComponentProps<"tr"> & { divider?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors data-[state=selected]:bg-muted",
        divider && "border-b border-gray-200",
        className,
      )}
      {...props}
    />
  );
}

/** Figma "Sort Icon": two chevrons in gray-400, the sorted direction's in gray-950. */
function SortIcon({
  direction = "none",
  className,
}: {
  direction?: SortDirection | "none";
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      data-slot="table-sort-icon"
      data-direction={direction}
      viewBox="0 0 24 24"
      width={16}
      height={16}
      className={cn("shrink-0", className)}
    >
      <path
        d="M18.2072 9.0428 12.0001 2.83569 5.793 9.0428 7.20721 10.457 12.0001 5.66412 16.793 10.457 18.2072 9.0428Z"
        className={direction === "ascending" ? "fill-gray-950" : "fill-gray-400"}
      />
      <path
        d="M5.79285 14.9572 12 21.1643 18.2071 14.9572 16.7928 13.543 12 18.3359 7.20706 13.543 5.79285 14.9572Z"
        className={direction === "descending" ? "fill-gray-950" : "fill-gray-400"}
      />
    </svg>
  );
}

/** Header label that sorts its column. The sorted column's label turns gray-950. */
function TableSortButton({
  direction,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { direction?: SortDirection }) {
  return (
    <button
      type="button"
      data-slot="table-sort-button"
      data-sorted={direction ? "" : undefined}
      className={cn(
        "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 transition-colors hover:text-gray-950 data-sorted:text-gray-950",
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
      <SortIcon direction={direction} />
    </button>
  );
}

/**
 * A column header. `sort` sets `aria-sort` and shows the sort icon unless it is
 * "none"; `onSort` turns the label into a button, so flip the direction in your
 * own state.
 */
function TableHead({
  className,
  sort = "none",
  onSort,
  children,
  ...props
}: Omit<React.ComponentProps<"th">, "onClick"> & {
  sort?: "none" | "unsorted" | SortDirection;
  onSort?: () => void;
}) {
  const direction = sort === "ascending" || sort === "descending" ? sort : undefined;
  return (
    <th
      data-slot="table-head"
      scope="col"
      aria-sort={direction ?? (sort === "unsorted" ? "none" : undefined)}
      className={cn(
        "py-2 pr-5 text-left align-middle text-body-sm font-medium last:pr-0",
        direction ? "text-gray-950" : "text-gray-500",
        className,
      )}
      {...props}
    >
      {onSort ? (
        <TableSortButton direction={direction} onClick={onSort}>
          {children}
        </TableSortButton>
      ) : (
        <span className="inline-flex items-center gap-1">
          {children}
          {sort !== "none" && <SortIcon direction={direction} />}
        </span>
      )}
    </th>
  );
}

type TableCellProps = Omit<React.ComponentProps<"td">, "children"> & {
  /** Defaults to "avatar" when `avatar` or `secondary` is set, else "text". */
  type?: "text" | "avatar" | "custom";
  /** Image for avatar cells, e.g. <CompanyAvatar size={32} />. */
  avatar?: React.ReactNode;
  /** Gray second line under the value. */
  secondary?: React.ReactNode;
  /** Outline star after the value. */
  star?: boolean;
  children?: React.ReactNode;
};

function TableCell({
  className,
  type,
  avatar,
  secondary,
  star = false,
  children,
  ...props
}: TableCellProps) {
  const kind = type ?? (avatar || secondary ? "avatar" : "text");
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "py-3 pr-5 align-middle text-body-sm font-normal text-gray-950 last:pr-0",
        className,
      )}
      {...props}
    >
      {kind === "text" && <div className="truncate">{children}</div>}
      {kind === "custom" && <div className="flex items-center gap-2">{children}</div>}
      {kind === "avatar" && (
        <div className="flex items-center gap-3">
          {avatar && <span className="shrink-0">{avatar}</span>}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{children}</span>
              {star && <RiStarLine {...iconProps} size={14} className="shrink-0 text-gray-400" />}
            </div>
            {secondary && <span className="truncate text-body-xs text-gray-500">{secondary}</span>}
          </div>
        </div>
      )}
    </td>
  );
}

/** The table's title, e.g. "Offers (4)", shown above the header. */
function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("pb-4 text-left text-body-lg font-medium text-gray-950", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableCard,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableHead as TableHeaderCell,
  TableRow,
  TableCell,
  TableCaption,
  SortIcon,
  TableSortButton,
};
