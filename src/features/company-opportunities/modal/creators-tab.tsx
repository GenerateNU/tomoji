"use client";

import type { Doc } from "@convex/_generated/dataModel";
import type { PaginationStatus } from "convex/react";
import { useMemo, useState } from "react";
import { Tag } from "@/components/ui/badge";
import {
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { CreatorCell } from "./creator-cell";
import { formatModalDate } from "./lib/format";
import { assignmentStatusTag } from "./lib/status-labels";
import { LoadMore, TableSkeleton, TabMessage } from "./paginated-table";

type CreatorsTabProps = {
  /** The backend's assignments: each is one creator's claim on the opportunity. */
  results: Doc<"assignments">[];
  status: PaginationStatus;
  loadMore: () => void;
};

/** The Creators tab: everyone who has joined the opportunity, with their agreed pay and status. */
export function CreatorsTab({ results, status, loadMore }: CreatorsTabProps) {
  const [direction, setDirection] = useState<"ascending" | "descending">("descending");
  const sorted = useMemo(() => {
    const rows = [...results].sort((a, b) => a._creationTime - b._creationTime);
    return direction === "ascending" ? rows : rows.reverse();
  }, [results, direction]);

  if (status === "LoadingFirstPage") return <TableSkeleton label="Loading creators…" />;
  if (results.length === 0) {
    return (
      <TabMessage title="No creators yet">
        Creators show up here once they join this opportunity.
      </TabMessage>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <TableCard title="Creators" count={results.length} hideTitle className="self-stretch">
        <TableHeader>
          <TableHead>Creator</TableHead>
          <TableHead
            sort={direction}
            onSort={() =>
              setDirection((current) => (current === "ascending" ? "descending" : "ascending"))
            }
            className="w-32 max-sm:hidden"
          >
            Joined
          </TableHead>
          <TableHead className="w-28 max-sm:hidden">Fixed fee</TableHead>
          <TableHead className="w-30 sm:w-36">Status</TableHead>
        </TableHeader>
        <TableBody>
          {sorted.map((assignment) => {
            const tag = assignmentStatusTag(assignment.status);
            return (
              <TableRow key={assignment._id}>
                <TableCell type="custom">
                  <CreatorCell creatorId={assignment.creatorId} />
                </TableCell>
                <TableCell className="max-sm:hidden">
                  {formatModalDate(assignment._creationTime)}
                </TableCell>
                {/* The fee agreed when they joined, which can differ from the current terms. */}
                <TableCell className="max-sm:hidden">
                  {formatMoney(assignment.fixedFeeCents)}
                </TableCell>
                <TableCell type="custom">
                  <Tag tone={tag.tone}>{tag.label}</Tag>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </TableCard>
      <LoadMore status={status} onLoadMore={loadMore} />
    </div>
  );
}
