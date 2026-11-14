"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import type { AcceptedOffer, ApplicationDetail } from "@convex/models/applications";
import { DeclineOfferModal } from "./decline-offer-modal";
import { useOfferResponse } from "../hooks/use-offer-response";
import { offerTiming } from "../lib/offer";

const BLOCKED_MESSAGES = {
  opportunity_full: "All spots on this opportunity are taken.",
  opportunity_closed: "This opportunity has closed.",
} as const;

// Fills the width on phones, where two 44px buttons share a row.
const buttonClass = "max-sm:flex-1";

function ButtonSpinner() {
  return <Spinner size={16} label="Working" className="text-current" />;
}

/**
 * The offer modal's actions. The server's `canAccept` knows nothing about the
 * clock, so a live offer is one that is also still before its deadline here; the
 * server refuses a late accept either way. Denying asks first, in a confirmation
 * dialog, since it can't be undone; accepting doesn't, since the creator has just
 * read the terms, and hands the result to `onAccepted`. The dialog stays mounted
 * in every state so it can animate closed after the offer flips to declined.
 * On an offer with terms, Accept in the "offer" view moves on to the "terms"
 * view, where accepting the terms accepts the offer.
 */
export function OfferFooter({
  detail,
  now,
  view,
  onReviewTerms,
  onAccepted,
}: {
  detail: ApplicationDetail;
  now: number;
  view: "offer" | "terms";
  onReviewTerms: () => void;
  onAccepted: (result: AcceptedOffer) => void;
}) {
  const { pending, accept, decline } = useOfferResponse(detail.applicationId);
  const [confirming, setConfirming] = useState(false);
  const declineRef = useRef<HTMLButtonElement>(null);
  const timing = offerTiming(detail.status, detail.offerExpiresAt, now);

  async function acceptOffer(options?: { acceptedTerms?: boolean }) {
    const result = await accept(options);
    if (result) onAccepted(result);
  }

  let actions: ReactNode;
  if (timing === "expired") {
    actions = (
      <Button disabled className={buttonClass}>
        Offer expired
      </Button>
    );
  } else if (timing === "declined") {
    actions = (
      <Button variant="secondary-subtle" disabled className={buttonClass}>
        Offer declined
      </Button>
    );
  } else if (timing === "accepted") {
    actions = (
      <Button disabled className={buttonClass}>
        Offer accepted
      </Button>
    );
  } else if (timing === "none") {
    actions = null;
  } else {
    actions = (
      <>
        {detail.acceptBlockedReason && (
          <p className="w-full text-body-sm text-gray-500 sm:text-right">
            {BLOCKED_MESSAGES[detail.acceptBlockedReason]}
          </p>
        )}
        <Button
          ref={declineRef}
          variant="secondary-subtle"
          disabled={!detail.canDecline || pending !== null}
          className={buttonClass}
          onClick={() => setConfirming(true)}
        >
          Deny
        </Button>
        <Button
          disabled={!detail.canAccept || pending !== null}
          className={buttonClass}
          onClick={() => {
            if (view === "terms") void acceptOffer({ acceptedTerms: true });
            else if (detail.termsRequired) onReviewTerms();
            else void acceptOffer();
          }}
        >
          {pending === "accept" && <ButtonSpinner />}
          {view === "terms" ? "Accept terms & conditions" : "Accept"}
        </Button>
      </>
    );
  }

  return (
    <>
      {actions}
      <DeclineOfferModal
        open={confirming}
        companyName={detail.opportunity.companyName}
        pending={pending === "decline"}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          if (await decline()) setConfirming(false);
        }}
        finalFocus={declineRef}
      />
    </>
  );
}
