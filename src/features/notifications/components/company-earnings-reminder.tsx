"use client";

import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyAmounts } from "@/features/company-home/components/home-card";
import { homePeriod, offerTime } from "@/features/company-home/lib/home";
import { useNow } from "@/hooks/use-now";
import { useStableQuery } from "@/hooks/use-stable-query";

/** Shows current approval obligations without inventing an automatic payment date. */
function ReminderContent({ onReview }: { onReview: () => void }) {
  const now = useNow();
  const { data } = useStableQuery(api.companyHome.earnings, homePeriod(now));
  if (!data)
    return (
      <Skeleton
        role="status"
        aria-label="Loading earnings reminder"
        className="h-39.5 w-full shrink-0 rounded-lg"
      />
    );
  if (data.creators.pending === 0) return null;
  const due = data.pending.nextApprovalDueAt;
  const hasHolds = data.pending.blockedAmounts.length > 0;
  const deadline =
    due === null
      ? "Earnings on hold"
      : due <= now
        ? "Earnings review overdue"
        : `Approval due ${new Date(due).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
  return (
    <section
      aria-label="Earnings awaiting review"
      className="flex w-full shrink-0 flex-col items-start gap-1.5 rounded-lg bg-gray-25 p-4"
    >
      <h3 className="text-body-sm leading-[19px] font-medium">{deadline}</h3>
      <p className="text-heading-md leading-[37px] font-medium">
        <MoneyAmounts amounts={data.pending.amounts} />
      </p>
      <p className="text-body-sm leading-[19px] text-gray-500">
        To {data.creators.pending} {data.creators.pending === 1 ? "creator" : "creators"}.
        {due === null
          ? " Resolve the open dispute before approval."
          : due > now
            ? ` ${offerTime(due, now)} to review.`
            : " Review these earnings now."}
        {hasHolds && due !== null ? " Some earnings are on hold during a dispute." : ""}
        {data.isPartial ? " Totals are partial; open payouts for details." : ""}
      </p>
      <Button variant="secondary-subtle" size="sm" onClick={onReview}>
        Review payouts
      </Button>
    </section>
  );
}

/** Keeps a failed earnings read recoverable without losing the notification list. */
export function CompanyEarningsReminder({ onReview }: { onReview: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary
      key={attempt}
      fallback={() => (
        <div
          role="alert"
          className="flex w-full shrink-0 flex-col items-start gap-2 rounded-lg bg-gray-25 p-4"
        >
          <p className="text-body-sm text-gray-600">Couldn’t load earnings.</p>
          <Button size="sm" variant="secondary-subtle" onClick={() => setAttempt(attempt + 1)}>
            Try earnings again
          </Button>
        </div>
      )}
    >
      <ReminderContent onReview={onReview} />
    </ErrorBoundary>
  );
}
