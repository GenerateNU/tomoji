"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { CompanyAvatar } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DisputeStatusTag } from "@/features/disputes/components/dispute-status-tag";
import { disputeTitle, formatDisputeDate } from "@/features/disputes/lib/dispute-labels";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useTablePage } from "../hooks/use-table-page";
import { LoadingRows, NoResults, OperatorHeader, TablePager } from "./directory-chrome";
import { OperatorDisputeModal } from "./operator-dispute-modal";

const PAGE_SIZE = 10;

/** Columns that drop below md, so a phone shows the dispute and status without scrolling sideways. */
const secondaryColumn = "hidden md:table-cell";

const TABS = [
  { status: "open", label: "Open" },
  { status: "resolved", label: "Resolved" },
] as const;

type Status = (typeof TABS)[number]["status"];

/** Every company's disputes. Open ones come oldest first, so the queue drains in order. */
export function OperatorDisputes() {
  const [status, setStatus] = useState<Status>("open");
  const [viewing, setViewing] = useState<Id<"disputes"> | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <OperatorHeader
        title="Disputes"
        description="Every dispute across the platform. Open ones are listed oldest first."
      />
      <Tabs value={status} onValueChange={(value) => setStatus(value as Status)} className="gap-6">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.status} value={tab.status}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => (
          <TabsContent key={tab.status} value={tab.status}>
            {status === tab.status && (
              <OperatorDisputesTable
                status={tab.status}
                label={`${tab.label} disputes`}
                onOpen={setViewing}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
      <OperatorDisputeModal disputeId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

export function OperatorDisputesTable({
  status,
  label,
  pageSize = PAGE_SIZE,
  onOpen,
}: {
  status: Status;
  label: string;
  pageSize?: number;
  onOpen: (disputeId: Id<"disputes">) => void;
}) {
  const query = usePaginatedQuery(api.disputes.list, { status }, { initialNumItems: pageSize });
  const page = useTablePage(query, pageSize, status);

  if (page.empty) {
    return (
      <NoResults>
        {status === "open"
          ? "Nothing is waiting on Ohani right now."
          : "No disputes have been closed yet."}
      </NoResults>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table bare aria-label={label} className="md:min-w-[44rem]">
        <TableHeader divider>
          <TableHead>Dispute</TableHead>
          <TableHead className="hidden sm:table-cell">Company</TableHead>
          <TableHead className={cn(secondaryColumn, "md:w-28")}>Opened by</TableHead>
          <TableHead className={cn(secondaryColumn, "md:w-36")}>Created</TableHead>
          <TableHead className="w-40">Status</TableHead>
        </TableHeader>
        <TableBody aria-busy={page.loading}>
          {page.loading ? (
            <LoadingRows
              columns={["", "hidden sm:table-cell", secondaryColumn, secondaryColumn, ""]}
              rows={3}
            />
          ) : (
            page.rows.map((dispute) => (
              <TableRow
                key={dispute._id}
                divider
                onClick={() => onOpen(dispute._id)}
                className="cursor-pointer hover:bg-gray-25"
              >
                <TableCell>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(dispute._id);
                    }}
                    className={cn("w-full cursor-pointer truncate rounded-xs text-left", focusRing)}
                  >
                    {disputeTitle(dispute)}
                  </button>
                </TableCell>
                <TableCell className="hidden sm:table-cell" avatar={<CompanyAvatar size={32} />}>
                  {dispute.companyName}
                </TableCell>
                <TableCell className={secondaryColumn}>
                  {dispute.openedByRole === "creator"
                    ? "Creator"
                    : dispute.openedByRole === "company"
                      ? "Company"
                      : "Ohani"}
                </TableCell>
                <TableCell className={secondaryColumn}>
                  {formatDisputeDate(dispute._creationTime)}
                </TableCell>
                <TableCell type="custom">
                  <DisputeStatusTag dispute={dispute} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {page.loading && (
        <span role="status" className="sr-only">
          Loading {label.toLowerCase()}…
        </span>
      )}
      <TablePager page={page} label={label} />
    </div>
  );
}
