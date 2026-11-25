"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { AcceptedOffer, ApplicationDetail } from "@convex/models/applications";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Modal } from "@/components/modal";
import { ModalLoadBoundary } from "@/components/modal-load-boundary";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyLogo } from "@/hooks/use-company-logo";
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
  /** Called with the new assignment details once the offer has been accepted. */
  onAccepted: (result: AcceptedOffer) => void;
  /** Called with the offer's status once it loads and whenever it changes. */
  onStatus?: (status: ApplicationDetail["status"]) => void;
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
  onAccepted,
  onStatus,
}: OfferModalProps & { applicationId: Id<"applications"> }) {
  const detail = useQuery(api.applications.getMineDetail, open ? { applicationId } : "skip");
  const status = detail?.status;
  useEffect(() => {
    if (status !== undefined) onStatus?.(status);
  }, [status, onStatus]);
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
    // The reject confirmation opens as a nested dialog; per Figma it replaces the
    // offer on screen, so hide this popup (keeping its state) while it's open.
    className: "data-[nested-dialog-open]:invisible",
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
        <OfferFooter
          detail={detail}
          now={now}
          view={view}
          onReviewTerms={() => setStep("terms")}
          onAccepted={onAccepted}
        />
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
 * the opportunity changes. Opening it, and what follows an accept, is up to the
 * caller.
 */
export function OfferModal({
  applicationId,
  open,
  onOpenChange,
  finalFocus,
  onAccepted,
  onStatus,
}: OfferModalProps) {
  if (applicationId === null) return null;
  return (
    <ModalLoadBoundary
      noun="offer"
      itemKey={applicationId}
      open={open}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      overlayClassName={OVERLAY}
    >
      <OfferContent
        applicationId={applicationId}
        open={open}
        onOpenChange={onOpenChange}
        finalFocus={finalFocus}
        onAccepted={onAccepted}
        onStatus={onStatus}
      />
    </ModalLoadBoundary>
  );
}
