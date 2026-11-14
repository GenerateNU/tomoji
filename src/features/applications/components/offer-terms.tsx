"use client";

import type { Ref } from "react";
import type { ApplicationDetail } from "@convex/models/applications";
import { reviewPolicyItems } from "../lib/offer";
import { OfferSummary } from "./offer-details";

/** The offer modal's second step: the offer's summary and the terms the creator accepts. */
export function OfferTerms({
  detail,
  now,
  headingRef,
}: {
  detail: ApplicationDetail;
  now: number;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const text = detail.opportunity.reviewPolicy;
  const items = reviewPolicyItems(text);

  return (
    <div className="flex flex-col gap-6">
      <OfferSummary detail={detail} now={now} />
      <section className="flex flex-col gap-2">
        <h3 ref={headingRef} tabIndex={-1} className="text-body font-medium text-gray-950">
          Terms &amp; Conditions
        </h3>
        {items.length >= 2 ? (
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-gray-950">
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ol>
        ) : (
          <p className="text-body whitespace-pre-line text-gray-950">{text.trim()}</p>
        )}
      </section>
    </div>
  );
}
