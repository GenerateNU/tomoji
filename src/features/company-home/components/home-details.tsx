"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyOpportunityModal } from "@/features/company-opportunities/modal/opportunity-modal";
import { SubmissionReviewModal } from "@/features/submissions/components/submission-review-modal";
import { useNow } from "@/hooks/use-now";
import type { HomeDetailsState, Offers } from "../lib/home";
import { OfferRow } from "./offer-row";
import { DetailsBoundary } from "./home-details-boundary";
import { EarningsReviewModal } from "./earnings-review-modal";

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

/** Opens the existing offer, draft or earnings workflow from a dashboard task. */
export function HomeDetails({
  state,
  offers,
  onClose,
}: {
  state: NonNullable<HomeDetailsState>;
  offers: Offers;
  onClose: () => void;
}) {
  if (state.kind === "earnings") return <EarningsReviewModal onClose={onClose} />;
  const title = state.kind === "offers" ? "Offers Out" : "Review submission";
  return (
    <DetailsBoundary title={title} onClose={onClose}>
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
          <OffersDetails offers={offers} />
        </Modal>
      )}
    </DetailsBoundary>
  );
}
