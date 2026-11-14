"use client";

import type { ApplicationDetail } from "@convex/models/applications";
import { formatMoney } from "@/lib/money";
import { formatCompensation } from "../lib/format";
import { formatFollowerRange } from "@/lib/follower-ranges";
import { acceptByLine } from "../lib/offer";
import { useCatalogLabels } from "../hooks/use-catalog-labels";
import { Section } from "./section";
import { Tags } from "./tags";
import { TextSection } from "./text-section";

/** The body of the offer modal: the brief a creator reads before accepting. */
export function OfferDetails({ detail, now }: { detail: ApplicationDetail; now: number }) {
  const { opportunity } = detail;
  const labels = useCatalogLabels();
  const acceptBy = acceptByLine(detail.status, detail.offerExpiresAt, now);
  const hasCap = opportunity.cpmRateCents > 0 && opportunity.paymentCapCents > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-body whitespace-pre-line text-gray-950">{opportunity.description}</p>
        <p className="text-body font-medium text-gray-950">
          {formatCompensation(opportunity, { showCap: false })}
        </p>
        {acceptBy && <p className="text-body-sm text-gray-500">{acceptBy}</p>}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section label="Skills">
          <Tags tags={opportunity.skills.map(labels.skill)} />
        </Section>
        <Section label="Niche">
          <Tags tags={opportunity.niches.map(labels.niche)} />
        </Section>
        {hasCap && (
          <Section label="Payment cap">
            <Tags tags={[formatMoney(opportunity.paymentCapCents)]} />
          </Section>
        )}
        {detail.minFollowerRange && (
          <Section label="Follower range">
            <Tags tags={[formatFollowerRange(detail.minFollowerRange)]} />
          </Section>
        )}
      </div>

      <TextSection label="Requirements" text={opportunity.contentRequirements} />
      <TextSection label="Review policy" text={opportunity.reviewPolicy} />
    </div>
  );
}
