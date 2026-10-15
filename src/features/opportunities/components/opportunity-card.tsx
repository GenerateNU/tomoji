import { Button } from "@/components/ui/button";
import { formatCompensation, formatDeadline } from "../lib/format";
import type { FeedOpportunity } from "../lib/types";
import { AvailabilityPill } from "./availability-pill";
import { CompanyAvatar } from "./company-avatar";
import { StarButton } from "./star-button";

/** Grid view card for one opportunity in the creator feed. */
export function OpportunityCard({
  opportunity,
  onApply,
}: {
  opportunity: FeedOpportunity;
  onApply: (opportunityId: Id<"opportunities">) => void;
}) {
  return (
    <article className="flex flex-col gap-[22px] rounded-2xl bg-muted/60 p-[22px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <CompanyAvatar name={opportunity.companyName} size="sm" />
          <p className="font-medium">{opportunity.companyName}</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-medium">{opportunity.title}</h3>
            <StarButton
              opportunityId={opportunity._id}
              title={opportunity.title}
              isStarred={opportunity.isStarred}
            />
          </div>
          <AvailabilityPill opportunity={opportunity} />
          <p className="line-clamp-2 text-sm">{opportunity.description}</p>
        </div>
        <dl className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/icons/opportunities/time.svg" alt="" width={18} height={18} />
            <dt>Apply by</dt>
            <dd className="font-semibold text-foreground">
              {formatDeadline(opportunity.deadline)}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/icons/opportunities/cash.svg" alt="" width={18} height={18} />
            <dt className="sr-only">Compensation</dt>
            <dd>{formatCompensation(opportunity)}</dd>
          </div>
        </dl>
      </div>
      {/* Ungated opportunity details/claiming are a separate flow. */}
      <Button
        type="button"
        className="mt-auto h-[41px] w-full rounded-[10px]"
        disabled={!opportunity.isGated}
        onClick={() => onApply(opportunity._id)}
      >
        {opportunity.isGated ? "Apply" : "View opportunity"}
      </Button>
    </article>
  );
}
import type { Id } from "@convex/_generated/dataModel";
