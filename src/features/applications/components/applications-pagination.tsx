"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZES = [5, 10, 20] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

const PAGE_SIZE_ITEMS = PAGE_SIZES.map((size) => ({
  value: size,
  label: `${size} rows per page`,
}));

/**
 * Previous/next over cursor pages. Convex gives no total, so there are no page
 * numbers past the current one; "next" is disabled once the last page loads.
 */
export function ApplicationsPagination({
  page,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  pageSize,
  onPageSizeChange,
}: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
}) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-4">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          <ChevronLeftIcon />
        </Button>
        <span
          aria-current="page"
          aria-label={`Page ${page}`}
          className="flex size-7.5 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
        >
          {page}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={!hasNext}
          onClick={onNext}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div aria-hidden className="h-6 w-px bg-border" />
      <div className="flex items-center gap-2">
        <span id="applications-page-size-label" className="text-sm font-medium">
          Showing
        </span>
        <Select
          items={PAGE_SIZE_ITEMS}
          value={pageSize}
          onValueChange={(size) => {
            if (size !== null) onPageSizeChange(size);
          }}
        >
          <SelectTrigger
            aria-labelledby="applications-page-size-label"
            className="w-40 px-4 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  );
}
