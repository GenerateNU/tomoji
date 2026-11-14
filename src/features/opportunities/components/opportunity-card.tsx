"use client";

import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompanyMedia } from "../hooks/use-company-media";
import { feedAction, feedTags } from "../lib/feed-status";
import { formatDeadline, formatPay } from "../lib/format";
import type { FeedOpportunity } from "../lib/types";
import { CompanyAvatar } from "./company-avatar";
import { StarButton } from "./star-button";

/** Grid view card for one opportunity in the creator feed. */
export function OpportunityCard({
  opportunity,
  onOpen,
}: {
  opportunity: FeedOpportunity;
  onOpen: (opportunityId: Id<"opportunities">) => void;
}) {
  const banner = useCompanyMedia(opportunity.companyBannerMediaId);
  const action = feedAction(opportunity);
  const primary = action.kind === "apply" || action.kind === "claim";
  return (
    <article className="flex flex-col overflow-hidden rounded-lg bg-gray-0 shadow-card">
      <div className="aspect-[386/118] w-full bg-gray-100">
        {banner && (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL from a private upload
          <img src={banner} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center gap-2">
          <CompanyAvatar name={opportunity.companyName} size="xs" />
          <p className="truncate text-body text-gray-950">{opportunity.companyName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {feedTags(opportunity).map((tag) => (
            <Badge key={tag.label} tone={tag.tone}>
              {tag.label}
            </Badge>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-heading-sm text-gray-950">{opportunity.title}</h3>
          <StarButton
            opportunityId={opportunity._id}
            title={opportunity.title}
            isStarred={opportunity.isStarred}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-body-lg text-gray-950">{formatPay(opportunity)}</p>
          <p className="text-body-sm text-gray-500">
            Apply by {formatDeadline(opportunity.deadline)}
          </p>
        </div>
        <Button
          type="button"
          variant={primary ? "primary" : "primary-subtle"}
          className="mt-auto w-full"
          aria-label={`${action.label}: ${opportunity.title}`}
          onClick={() => onOpen(opportunity._id)}
        >
          {action.label}
        </Button>
      </div>
    </article>
  );
}
