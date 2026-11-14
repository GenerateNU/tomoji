import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

/** A table row's worth of placeholder, matching the real row's columns. */
export function SkeletonRow() {
  return (
    <TableRow aria-hidden>
      <TableCell type="custom">
        <Skeleton className="h-5 w-3/4" />
      </TableCell>
      <TableCell type="custom">
        <Skeleton className="size-6 shrink-0" />
        <Skeleton className="h-5 w-2/3" />
      </TableCell>
      <TableCell type="custom">
        <Skeleton className="h-7 w-20" />
      </TableCell>
      <TableCell type="custom">
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell type="custom">
        <Skeleton className="h-5 w-28" />
      </TableCell>
    </TableRow>
  );
}
