"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyOpportunityModal } from "@/features/company-opportunities/modal/opportunity-modal";
import { CreatorCell } from "@/features/company-opportunities/modal/creator-cell";
import { SubmissionReviewModal } from "@/features/submissions/components/submission-review-modal";
import { useNow } from "@/hooks/use-now";
import { useStablePaginatedQuery } from "@/hooks/use-stable-paginated-query";
import { errorMessage } from "@/lib/errors";
import { homeMoney, type HomeDetailsState, type Offers } from "../lib/home";
import { OfferRow } from "./offer-row";

/** Opens existing opportunity workflows from the bounded offer list. */
function OffersDetails({ offers }: { offers: Offers }) {
  const now = useNow();
  const [opportunityId, setOpportunityId] = useState<Id<"opportunities"> | null>(null);
  return (
    <>
      {offers.count === 0 ? (
        <p className="text-body text-gray-500">No offers out. Offers you send will show up here.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {offers.rows.map((row) => (
            <OfferRow
              key={row.applicationId}
              row={row}
              now={now}
              onClick={() => setOpportunityId(row.opportunityId)}
            />
          ))}
        </div>
      )}
      {offers.isPartial && (
        <p className="mt-4 text-body-sm text-gray-500">Showing the 100 soonest-expiring offers.</p>
      )}
      <CompanyOpportunityModal
        initialTab="applications"
        opportunityId={opportunityId}
        open={opportunityId !== null}
        onOpenChange={(open) => {
          if (!open) setOpportunityId(null);
        }}
      />
    </>
  );
}

type Payout = FunctionReturnType<typeof api.payouts.list>["page"][number];

/** Approves only an eligible payout, retaining row context and retry copy on failure. */
function EarningRow({ payout }: { payout: Payout }) {
  const approve = useMutation(api.payouts.approve);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** Prevents duplicate approval requests and preserves a failed row for retry. */
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await approve({ payoutId: payout._id });
    } catch (e) {
      setError(
        errorMessage(e, {
          invalid_state:
            "This earning is on hold or no longer awaiting approval. Refresh the list before retrying.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 py-4 last:border-0">
      <div className="min-w-0">
        <CreatorCell creatorId={payout.creatorId} />
        <p className="mt-2 text-body-sm text-gray-500">
          {payout.review.hasOpenDispute
            ? "On hold during an open dispute"
            : `Review by ${new Date(payout.approvalDueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-body font-medium">{homeMoney(payout.amount, payout.currency)}</span>
        {payout.review.canApprove && (
          <Button variant="primary-subtle" size="sm" disabled={busy} onClick={() => void submit()}>
            {busy ? "Approving…" : "Approve"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="w-full text-body-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

/** Reads pending payouts with existing pagination and server-supplied approval eligibility. */
function EarningsDetails() {
  const { results, status, loadMore } = useStablePaginatedQuery(
    api.payouts.list,
    { approvalStatus: "pending" },
    { initialNumItems: 10 },
  );
  if (status === "LoadingFirstPage")
    return <Skeleton role="status" aria-label="Loading earnings" className="h-24 w-full" />;
  return (
    <>
      <p className="mb-4 text-body-sm text-gray-500">
        Approval records your review. Open disputes hold earnings, and only company admins can
        approve.
      </p>
      {results.length ? (
        <ul>
          {results.map((p) => (
            <EarningRow key={p._id} payout={p} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-gray-500">Nothing to approve.</p>
      )}
      {status !== "Exhausted" && (
        <Button
          className="mt-4"
          size="sm"
          variant="secondary-subtle"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(10)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more earnings"}
        </Button>
      )}
    </>
  );
}

/** Retrieves the existing queue row only on intent, then reuses the full round-review modal. */
function DraftDetails({
  submissionId,
  onClose,
}: {
  submissionId: Id<"submissions">;
  onClose: () => void;
}) {
  const queue = useQuery(api.submissions.listCompanyQueue, {});
  const row = queue?.rows.find((r) => r.submissionId === submissionId);
  if (row) return <SubmissionReviewModal row={row} onClose={onClose} />;
  return (
    <Modal
      open
      title="Review submission"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {queue === undefined ? (
        <Skeleton role="status" aria-label="Loading submission" className="h-48 w-full" />
      ) : (
        <div className="space-y-4">
          <p>This draft is no longer in the preview queue.</p>
          <Button render={<Link href="/submissions" />} nativeButton={false}>
            View submissions
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Keeps a detail-query failure inside its modal, with a fresh read on retry. */
export function HomeDetails({
  state,
  offers,
  onClose,
}: {
  state: NonNullable<HomeDetailsState>;
  offers: Offers;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const title =
    state.kind === "offers"
      ? "Offers Out"
      : state.kind === "earnings"
        ? "Review Earnings"
        : "Review submission";
  return (
    <ErrorBoundary
      key={attempt}
      fallback={() => (
        <Modal
          open
          title={title}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <div role="alert" className="space-y-4">
            <p>Couldn’t load these details. Try again.</p>
            <Button onClick={() => setAttempt(attempt + 1)}>Try again</Button>
          </div>
        </Modal>
      )}
    >
      {state.kind === "draft" ? (
        <DraftDetails submissionId={state.submissionId} onClose={onClose} />
      ) : (
        <Modal
          open
          title={title}
          className="sm:max-w-2xl"
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          {state.kind === "offers" ? <OffersDetails offers={offers} /> : <EarningsDetails />}
        </Modal>
      )}
    </ErrorBoundary>
  );
}
