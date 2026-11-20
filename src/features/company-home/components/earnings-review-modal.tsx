"use client";

import { useState, type ComponentProps } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreatorCell } from "@/features/company-opportunities/modal/creator-cell";
import { useStablePaginatedQuery } from "@/hooks/use-stable-paginated-query";
import { errorMessage } from "@/lib/errors";
import { homeMoney } from "../lib/home";
import { DetailsBoundary } from "./home-details-boundary";

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

/** Shared earnings review from Home and the notification reminder; server rules control approval. */
export function EarningsReviewModal({
  onClose,
  finalFocus,
}: {
  onClose: () => void;
  finalFocus?: ComponentProps<typeof Modal>["finalFocus"];
}) {
  return (
    <DetailsBoundary title="Review Earnings" onClose={onClose} finalFocus={finalFocus}>
      <Modal
        open
        title="Review Earnings"
        className="sm:max-w-2xl"
        finalFocus={finalFocus}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <EarningsDetails />
      </Modal>
    </DetailsBoundary>
  );
}
