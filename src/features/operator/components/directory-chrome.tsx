"use client";

import type { ReactNode } from "react";
import { RiSearchLine } from "@remixicon/react";
import { TextField } from "@/components/text-field";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import type { TablePage } from "../hooks/use-table-page";

/** The title, supporting line and primary action at the top of an operator page. */
export function OperatorHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-heading-lg font-medium text-gray-950">{title}</h1>
        <p className="text-body-sm text-gray-500">{description}</p>
      </div>
      {action}
    </header>
  );
}

/** The search box above a directory table. Filtering happens on the server. */
export function DirectorySearch({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      type="search"
      aria-label={label}
      placeholder={placeholder}
      icon={RiSearchLine}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full sm:max-w-80"
    />
  );
}

/**
 * Placeholder rows that hold the table's height while a page loads. `columns`
 * is one class per column, so the skeleton hides exactly the columns the real
 * rows hide and the two never disagree about how many are on screen.
 */
export function LoadingRows({ columns, rows = 5 }: { columns: (string | false)[]; rows?: number }) {
  return Array.from({ length: rows }, (_, row) => (
    <TableRow key={row}>
      {columns.map(
        (className, column) =>
          className !== false && (
            <TableCell key={column} className={className}>
              <Skeleton className="h-5 w-3/4" />
            </TableCell>
          ),
      )}
    </TableRow>
  ));
}

/** Previous / page number / next, driven by `useTablePage`. */
export function TablePager({ page, label }: { page: TablePage<unknown>; label: string }) {
  if (!page.hasPrevious && !page.hasNext) return null;
  return (
    <Pagination aria-label={`${label} pages`} className="justify-center">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            render={<button type="button" />}
            disabled={!page.hasPrevious}
            onClick={page.previous}
          />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink render={<span />} isActive>
            {page.pageIndex + 1}
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            render={<button type="button" />}
            disabled={!page.hasNext}
            onClick={page.next}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

/** What a table shows when a search or filter matched nothing. */
export function NoResults({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-body font-medium text-gray-700">Nothing to show</p>
      <p className="max-w-sm text-body-sm text-gray-500">{children}</p>
    </div>
  );
}
