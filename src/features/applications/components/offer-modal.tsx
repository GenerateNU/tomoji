"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ApplicationDetail } from "@convex/models/applications";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyLogo } from "@/hooks/use-company-logo";
import { errorCode } from "@/lib/errors";
import { useOfferClock } from "../hooks/use-offer-clock";
import { formatOfferDeadline } from "../lib/format";
import { offerStatusTag, offerTiming } from "../lib/offer";
import { OfferDetails } from "./offer-details";
import { OfferFooter } from "./offer-footer";
import { OfferTerms } from "./offer-terms";

type OfferModalProps = {
  /** The offer to show; kept after closing so the dialog doesn't change as it leaves. */
  applicationId: Id<"applications"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus?: ComponentProps<typeof Modal>["finalFocus"];
};

const OVERLAY = "backdrop-blur-xs";

function CompanyEyebrow({ detail }: { detail: ApplicationDetail }) {
  const logo = useCompanyLogo(detail.companyLogoMediaId);
  const name = detail.opportunity.companyName;
  return (
    <span className="flex min-w-0 items-center gap-2 text-body text-gray-950">
      <CompanyAvatar size={32} src={logo.url} initials={name ? getInitials(name) : undefined} />
      <span className="min-w-0 truncate">{name || "Unknown company"}</span>
    </span>
  );
}

function OfferContent({
  applicationId,
  open,
  onOpenChange,
  finalFocus,
}: OfferModalProps & { applicationId: Id<"applications"> }) {
  const detail = useQuery(api.applications.getMineDetail, open ? { applicationId } : "skip");
  // Offers are timed to the minute, and to the second once urgent.
  const now = useOfferClock(detail?.status, detail?.offerExpiresAt);
  const [step, setStep] = useState<"offer" | "terms">("offer");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep("offer");
  }
  const termsHeading = useRef<HTMLHeadingElement>(null);
  const timing = detail ? offerTiming(detail.status, detail.offerExpiresAt, now) : "none";
  const view =
    step === "terms" && detail?.termsRequired && (timing === "live" || timing === "urgent")
      ? "terms"
      : "offer";
  useEffect(() => {
    if (view === "terms") termsHeading.current?.focus();
  }, [view]);
  const common = {
    open,
    onOpenChange,
    finalFocus,
    overlayClassName: OVERLAY,
    titleSize: "lg",
  } as const;

  if (detail === undefined) {
    return (
      <Modal
        {...common}
        title={
          <>
            <span className="sr-only">Loading offer…</span>
            <Skeleton className="h-8 w-64 max-w-full" />
          </>
        }
      >
        <div aria-hidden className="flex flex-col gap-4">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
      </Modal>
    );
  }

  const tag = offerStatusTag(detail.status, detail.offerExpiresAt, now);
  return (
    <Modal
      {...common}
      title={detail.opportunity.title}
      eyebrow={<CompanyEyebrow detail={detail} />}
      titleAddon={
        <>
          <Tag size="md" tone="primary">
            Applied
          </Tag>
          {tag && (
            <Tag size="md" tone={tag.tone}>
              {tag.countdown ? (
                <span
                  role="timer"
                  className="tabular-nums"
                  aria-label={`Offer expires ${formatOfferDeadline(detail.offerExpiresAt ?? now, { withTime: true })}`}
                  title={`Expires ${formatOfferDeadline(detail.offerExpiresAt ?? now, { withTime: true })}`}
                >
                  {tag.label}
                </span>
              ) : (
                tag.label
              )}
            </Tag>
          )}
        </>
      }
      footer={
        <OfferFooter detail={detail} now={now} view={view} onReviewTerms={() => setStep("terms")} />
      }
    >
      {view === "terms" ? (
        <OfferTerms detail={detail} now={now} headingRef={termsHeading} />
      ) : (
        <OfferDetails detail={detail} now={now} />
      )}
    </Modal>
  );
}

/**
 * The dialog for one offer: the brief and its deadline, then, when the
 * opportunity has a review policy, a terms step; accepting those terms accepts
 * the offer. Deny declines it. An urgent offer shows a live countdown. It reads
 * the offer itself, so it updates live when the offer is accepted, expires, or
 * the opportunity changes. Opening it is up to the caller.
 */
export function OfferModal({ applicationId, open, onOpenChange, finalFocus }: OfferModalProps) {
  // Remounting the boundary is what clears a failed read.
  const [attempt, setAttempt] = useState(0);
  if (applicationId === null) return null;
  return (
    <ErrorBoundary
      key={`${applicationId}:${attempt}`}
      fallback={(error) => (
        <Modal
          open={open}
          onOpenChange={onOpenChange}
          finalFocus={finalFocus}
          overlayClassName={OVERLAY}
          title="Offer unavailable"
          footer={
            errorCode(error) === "not_found" ? undefined : (
              <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
            )
          }
        >
          <p className="text-body text-gray-700">
            {errorCode(error) === "not_found"
              ? "This offer is no longer available."
              : "We couldn’t load this offer."}
          </p>
        </Modal>
      )}
    >
      <OfferContent
        applicationId={applicationId}
        open={open}
        onOpenChange={onOpenChange}
        finalFocus={finalFocus}
      />
    </ErrorBoundary>
  );
}
