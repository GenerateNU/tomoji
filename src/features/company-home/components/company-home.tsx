"use client";

import Link from "next/link";
import { api } from "@convex/_generated/api";
import { RiAddLine } from "@remixicon/react";
import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { useStableQuery } from "@/hooks/use-stable-query";
import { formatRelativeTime } from "@/lib/relative-time";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { homePeriod, offerTime, type Earnings, type HomeDetailsState } from "../lib/home";
import { HomeCard, EmptyTask, HomeSkeleton, MoneyAmounts } from "./home-card";
import { HomePerformance } from "./home-performance";
import { HomeDetails } from "./home-details";
import { DraftThumbnail } from "./draft-thumbnail";

import { OfferRow } from "./offer-row";

/** Matches the summary tile geometry while allowing long currency totals to wrap. */
function SummaryCard({
  title,
  children,
  compact,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col items-start gap-3 rounded-lg bg-gray-0 p-5 shadow-raised",
        compact ? "min-h-41" : "min-h-46.75",
      )}
    >
      <h2 className="text-body font-normal text-gray-600">{title}</h2>
      {children}
    </section>
  );
}

/** Explains actual approval deadlines and dispute holds without promising a bank payout date. */
function EarningsTask({ earnings, now }: { earnings: Earnings; now: number }) {
  const due = earnings.pending.nextApprovalDueAt;
  const hasHolds = earnings.pending.blockedAmounts.length > 0;
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-heading-md leading-[38px] font-medium">
          <MoneyAmounts amounts={earnings.pending.amounts} />
        </p>
        <p className="text-body text-gray-500">
          {earnings.pending.amounts.length === 0
            ? "All approved"
            : due === null
              ? "On hold"
              : due <= now
                ? "Approval overdue"
                : `due in ${offerTime(due, now).replace(/ left$/, "")}`}
        </p>
      </div>
      <p className="text-body-sm text-gray-500">
        {earnings.pending.amounts.length === 0
          ? "All current earnings have been approved."
          : due === null
            ? "An open dispute must be resolved before approval."
            : `Review by ${new Date(due).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`}
        {hasHolds && due !== null ? " Some earnings are on hold during a dispute." : ""}
      </p>
      <dl className="flex w-full flex-col gap-2.5 text-body">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-600">Approved</dt>
          <dd className="text-right font-medium">
            {earnings.creators.approved} of {earnings.creators.total} creators
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-600">Left to approve</dt>
          <dd className="text-right font-medium">
            <MoneyAmounts amounts={earnings.pending.amounts} />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-600">Already approved</dt>
          <dd className="text-right font-medium">
            <MoneyAmounts amounts={earnings.approvedInPeriod.amounts} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Reads live company data with stable results while the display clock or week changes. */
function CompanyHomeContent({ firstName, canCreate }: { firstName: string; canCreate: boolean }) {
  const now = useNow();
  const range = homePeriod(now);
  const company = useQuery(api.companies.me, {});
  const { data: overview } = useStableQuery(api.companyHome.overview, range);
  const { data: offers } = useStableQuery(api.companyHome.offers, { asOf: now });
  const { data: drafts } = useStableQuery(api.companyHome.drafts, {});
  const { data: earnings } = useStableQuery(api.companyHome.earnings, range);
  const [details, setDetails] = useState<HomeDetailsState>(null);
  if (!company || !overview || !offers || !drafts || !earnings) return <HomeSkeleton />;
  const quiet =
    overview.liveCampaigns.value === 0 &&
    overview.performance.views === 0 &&
    overview.spend.amounts.length === 0 &&
    offers.count === 0 &&
    drafts.count === 0 &&
    earnings.creators.total === 0;
  const partial =
    overview.liveCampaigns.capped ||
    overview.spend.isPartial ||
    overview.performance.isPartial ||
    offers.isPartial ||
    drafts.isPartial ||
    earnings.isPartial;
  return (
    <>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2 pr-8">
          <h1 className="text-heading-lg leading-[43px] font-medium text-gray-950">
            {quiet
              ? `All quiet on the ${company.name} front`
              : `Welcome back${firstName ? `, ${firstName}` : ""}!`}
          </h1>
          <p className="text-body text-gray-600">
            {quiet
              ? "Nothing to review and nobody waiting. A campaign is what gets creators applying."
              : "Here’s how your campaigns are doing and what needs you."}
          </p>
        </header>
        <div className="grid gap-5 xl:grid-cols-3">
          <SummaryCard title="Spend" compact={quiet}>
            <p className="text-heading-md leading-[38px] font-medium">
              <MoneyAmounts amounts={overview.spend.amounts} />
            </p>
            <p className="text-body-sm text-gray-500">
              {quiet
                ? "no campaigns running"
                : `across ${overview.spend.campaignCount} ${overview.spend.campaignCount === 1 ? "campaign" : "campaigns"} this week`}
            </p>
          </SummaryCard>
          <SummaryCard title="Performance" compact={quiet}>
            <p className="text-heading-md leading-[38px] font-medium">
              {overview.performance.views === null
                ? "Views unavailable"
                : `${overview.performance.views.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })} Views`}
            </p>
            <HomePerformance performance={overview.performance} />
          </SummaryCard>
          <SummaryCard title="Campaigns" compact={quiet}>
            <p className="text-heading-md leading-[38px] font-medium">
              {overview.liveCampaigns.value}
              {overview.liveCampaigns.capped ? "+" : ""} live
            </p>
            {canCreate ? (
              <Button
                size="sm"
                variant="primary-subtle"
                icon={RiAddLine}
                className="mt-2"
                render={<Link href="/campaigns/new" />}
                nativeButton={false}
              >
                Create a campaign
              </Button>
            ) : (
              <p className="text-body-sm text-gray-500">Ask an admin to create a campaign.</p>
            )}
          </SummaryCard>
        </div>
      </div>
      {partial && (
        <p role="status" className="text-body-sm text-gray-600">
          Some totals and previews are partial. Open the relevant list to review the available
          records.
        </p>
      )}
      <section aria-labelledby="company-todo" className="flex flex-col gap-6">
        <h2 id="company-todo" className="text-heading-sm leading-8 font-medium">
          To-Do
        </h2>
        <div className="grid gap-5 xl:grid-cols-3">
          <HomeCard title="Offers Out">
            <p className="-mt-4.5 text-body-sm text-gray-500">Waiting on creators to accept.</p>
            {offers.count ? (
              <div className="flex w-full flex-col gap-3.5">
                {offers.rows.slice(0, 5).map((row) => (
                  <OfferRow
                    key={row.applicationId}
                    row={row}
                    now={now}
                    onClick={() => setDetails({ kind: "offers" })}
                  />
                ))}
              </div>
            ) : (
              <EmptyTask title="No offers out">Offers you send will show up here.</EmptyTask>
            )}
            <Button
              size="sm"
              variant="primary-subtle"
              onClick={() => setDetails({ kind: "offers" })}
            >
              View Offers
            </Button>
          </HomeCard>
          <HomeCard title="Drafts to Review">
            {drafts.count ? (
              <div className="grid w-full grid-cols-2 gap-3">
                {drafts.rows.map((row) => (
                  <button
                    key={row.submissionId}
                    type="button"
                    onClick={() => setDetails({ kind: "draft", submissionId: row.submissionId })}
                    aria-label={`Review ${row.title} by ${row.creatorName}`}
                    className={cn(
                      "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded text-left",
                      focusRing,
                    )}
                  >
                    <DraftThumbnail mediaId={row.mediaId} />
                    <span className="w-full truncate text-body font-medium">{row.creatorName}</span>
                    <span className="text-body-sm text-gray-500">
                      {formatRelativeTime(row.submittedAt, now)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyTask title="Nothing to review">
                Drafts creators submit will queue up here.
              </EmptyTask>
            )}
            <Button
              size="sm"
              variant="primary-subtle"
              render={<Link href="/submissions" />}
              nativeButton={false}
            >
              Review All Drafts
            </Button>
          </HomeCard>
          <HomeCard title="Weekly earnings to approve">
            {earnings.creators.total ? (
              <EarningsTask earnings={earnings} now={now} />
            ) : (
              <EmptyTask title="Nothing to approve">Earnings appear once posts are live.</EmptyTask>
            )}
            <Button
              size="sm"
              variant="primary-subtle"
              onClick={() => setDetails({ kind: "earnings" })}
            >
              Review Earnings
            </Button>
          </HomeCard>
        </div>
      </section>
      {details && <HomeDetails state={details} offers={offers} onClose={() => setDetails(null)} />}
    </>
  );
}

/** Company-only home with retryable reads; other account types keep their existing homes. */
export function CompanyHome({ firstName, canCreate }: { firstName: string; canCreate: boolean }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="flex w-full min-w-0 flex-col gap-10 px-5 py-10 [&_.text-body-sm]:leading-[19px] md:p-16">
      <ErrorBoundary
        key={attempt}
        fallback={() => (
          <div role="alert" className="flex flex-col items-start gap-4">
            <h1 className="text-heading-lg leading-[43px] font-medium">
              Couldn’t load your dashboard
            </h1>
            <p className="text-body text-gray-600">Try again to refresh your company’s activity.</p>
            <Button variant="primary-subtle" onClick={() => setAttempt(attempt + 1)}>
              Try again
            </Button>
          </div>
        )}
      >
        <CompanyHomeContent firstName={firstName} canCreate={canCreate} />
      </ErrorBoundary>
    </div>
  );
}
