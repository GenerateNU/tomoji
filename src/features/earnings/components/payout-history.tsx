"use client";

import { api } from "@convex/_generated/api";
import { RiMoreLine } from "@remixicon/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { formatDate, formatPeriod } from "../lib/earnings-format";
import { PayoutReceipt, type PayoutPeriod } from "./payout-receipt";

type SortKey = "period" | "amount";
type Sort = { key: SortKey; direction: "ascending" | "descending" };

const startOf = (period: PayoutPeriod) => period.earningPeriod?.startsAt ?? period.earnedAt;

/** The creator's payouts by earning period, newest first, each with its receipt. */
export function PayoutHistory() {
  const result = useQuery(api.payouts.periods);
  const [sort, setSort] = useState<Sort>({ key: "period", direction: "descending" });
  const [receipt, setReceipt] = useState<PayoutPeriod | null>(null);

  const periods = result?.periods.toSorted((a, b) => {
    const diff = sort.key === "amount" ? a.amount - b.amount : startOf(a) - startOf(b);
    return sort.direction === "ascending" ? diff : -diff;
  });
  const sortBy = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "descending" ? "ascending" : "descending",
    }));
  const sortOf = (key: SortKey) => (sort.key === key ? sort.direction : "unsorted");

  return (
    <section aria-labelledby="payout-history" className="flex flex-col gap-4">
      <h2 id="payout-history" className="text-body-lg font-medium text-gray-950">
        Payout History
      </h2>

      {periods?.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-gray-500">No payouts yet.</p>
      ) : (
        <Table bare aria-labelledby="payout-history" className="min-w-xl">
          <TableHeader>
            <TableHead sort={sortOf("period")} onSort={() => sortBy("period")}>
              Earning Period
            </TableHead>
            <TableHead sort={sortOf("amount")} onSort={() => sortBy("amount")}>
              Amount Earned
            </TableHead>
            <TableHead>Date Approved</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableHeader>
          <TableBody aria-busy={periods === undefined}>
            {periods === undefined
              ? Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 3 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                ))
              : periods.map((period) => (
                  <TableRow key={`${startOf(period)}-${period.earnedAt}`}>
                    <TableCell>
                      {period.earningPeriod
                        ? formatPeriod(period.earningPeriod)
                        : formatDate(period.earnedAt)}
                    </TableCell>
                    <TableCell>+{formatMoney(period.amount)}</TableCell>
                    <TableCell className={cn(period.approvedAt === null && "text-gray-500")}>
                      {period.approvedAt === null
                        ? "Awaiting approval"
                        : formatDate(period.approvedAt)}
                    </TableCell>
                    <TableCell type="custom">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="Payout actions"
                          className={cn(
                            "cursor-pointer rounded-xs text-gray-500 hover:text-gray-950",
                            focusRing,
                          )}
                        >
                          <RiMoreLine aria-hidden size={16} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setReceipt(period)}>
                            View Receipt
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}
      {result?.isPartial && (
        <p className="text-body-xs text-gray-500">Showing your most recent 500 payouts.</p>
      )}

      <PayoutReceipt period={receipt} onClose={() => setReceipt(null)} />
    </section>
  );
}
