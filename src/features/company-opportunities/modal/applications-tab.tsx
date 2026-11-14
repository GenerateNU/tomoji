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
import { formatRelativeTime } from "@/lib/relative-time";
import { CreatorCell } from "./creator-cell";
import { applicationStatusTag } from "./lib/status-labels";
import { LoadMore, TableSkeleton, TabMessage } from "./paginated-table";

type ApplicationsTabProps = {
  /** Only gated opportunities take applications; others are claimed directly. */
  isGated: boolean;
  results: Doc<"applications">[];
  status: PaginationStatus;
  loadMore: () => void;
  now: number;
};

/**
 * The Applications tab: who applied to a gated opportunity, newest first, and
 * where each application stands. Read-only here; offers are made elsewhere.
 */
export function ApplicationsTab({ isGated, results, status, loadMore, now }: ApplicationsTabProps) {
  const [direction, setDirection] = useState<"ascending" | "descending">("descending");
  const sorted = useMemo(() => {
    const rows = [...results].sort((a, b) => a._creationTime - b._creationTime);
    return direction === "ascending" ? rows : rows.reverse();
  }, [results, direction]);

  if (!isGated) {
    return (
      <TabMessage title="No applications needed">
        Creators join this opportunity directly, without applying. To review creators first, edit
        the opportunity to require applications.
      </TabMessage>
    );
  }
  if (status === "LoadingFirstPage") return <TableSkeleton label="Loading applications…" />;
  if (results.length === 0) {
    return (
      <TabMessage title="No applications yet">
        Applications appear here as creators apply to this opportunity.
      </TabMessage>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <TableCard title="Applications" count={results.length} hideTitle className="self-stretch">
        <TableHeader>
          <TableHead>Creator</TableHead>
          <TableHead
            sort={direction}
            onSort={() =>
              setDirection((current) => (current === "ascending" ? "descending" : "ascending"))
            }
            className="w-36 max-sm:hidden"
          >
            Applied
          </TableHead>
          <TableHead className="w-30 sm:w-40">Status</TableHead>
        </TableHeader>
        <TableBody>
          {sorted.map((application) => {
            const tag = applicationStatusTag(application.status);
            return (
              <TableRow key={application._id}>
                <TableCell type="custom">
                  <CreatorCell creatorId={application.creatorId} secondary={application.note} />
                </TableCell>
                <TableCell className="max-sm:hidden">
                  <time dateTime={new Date(application._creationTime).toISOString()}>
                    {formatRelativeTime(application._creationTime, now)}
                  </time>
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
