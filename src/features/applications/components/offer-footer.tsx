"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import type { ApplicationDetail } from "@convex/models/applications";
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
 * server refuses a late accept either way. Declining asks first, inline, since
 * it can't be undone; accepting doesn't, since the creator has just read the terms.
 */
export function OfferFooter({ detail, now }: { detail: ApplicationDetail; now: number }) {
  const { pending, accept, decline } = useOfferResponse(detail.applicationId);
  const [confirming, setConfirming] = useState(false);
  const declineRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const timing = offerTiming(detail.status, detail.offerExpiresAt, now);

  // Backing out of the confirmation puts focus back on the button that opened it.
  useEffect(() => {
    if (!confirming && returnFocus.current) {
      returnFocus.current = false;
      declineRef.current?.focus();
    }
  }, [confirming]);

  if (timing === "expired") {
    return (
      <Button disabled className={buttonClass}>
        Offer expired
      </Button>
    );
  }
  if (timing === "declined") {
    return (
      <Button variant="secondary" disabled className={buttonClass}>
        Offer declined
      </Button>
    );
  }
  if (timing === "accepted") {
    return (
      <Button disabled className={buttonClass}>
        Offer accepted
      </Button>
    );
  }
  if (timing === "none") return null;

  if (confirming) {
    return (
      <>
        <p role="alert" className="w-full text-body-sm text-gray-700 sm:text-right">
          Decline this offer? The company will be told and you can&apos;t undo this.
        </p>
        <Button
          variant="secondary-subtle"
          autoFocus
          disabled={pending !== null}
          className={buttonClass}
          onClick={() => {
            returnFocus.current = true;
            setConfirming(false);
          }}
        >
          Keep offer
        </Button>
        <Button
          variant="destructive-subtle"
          disabled={pending !== null}
          className={buttonClass}
          onClick={async () => {
            if (!(await decline())) setConfirming(false);
          }}
        >
          {pending === "decline" && <ButtonSpinner />}
          Decline offer
        </Button>
      </>
    );
  }

  return (
    <>
      {detail.acceptBlockedReason && (
        <p className="w-full text-body-sm text-gray-500 sm:text-right">
          {BLOCKED_MESSAGES[detail.acceptBlockedReason]}
        </p>
      )}
      <Button
        ref={declineRef}
        variant="secondary"
        disabled={!detail.canDecline || pending !== null}
        className={buttonClass}
        onClick={() => setConfirming(true)}
      >
        Decline
      </Button>
      <Button
        disabled={!detail.canAccept || pending !== null}
        className={buttonClass}
        onClick={() => void accept()}
      >
        {pending === "accept" && <ButtonSpinner />}
        Accept offer
      </Button>
    </>
  );
}
