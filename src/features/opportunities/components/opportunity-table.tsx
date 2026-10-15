import { formatCompensation, formatDeadline, formatPostedAgo } from "../lib/format";
import type { FeedOpportunity } from "../lib/types";
import { AvailabilityPill } from "./availability-pill";
import { CompanyAvatar } from "./company-avatar";
import { StarButton } from "./star-button";

/** List view of the creator feed: one row per opportunity. */
export function OpportunityTable({
  opportunities,
  now,
  onApply,
}: {
  opportunities: FeedOpportunity[];
  now: number;
  onApply: (opportunityId: Id<"opportunities">) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-y-3 text-left">
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="font-normal">
              Opportunity
            </th>
            <th scope="col" className="font-normal">
              Posted
            </th>
            <th scope="col" className="font-normal">
              Deadline
            </th>
            <th scope="col" className="font-normal">
              Type
            </th>
            <th scope="col" className="font-normal">
              Compensation
            </th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opportunity) => (
            <tr key={opportunity._id}>
              <td>
                <div className="flex items-center gap-4">
                  <CompanyAvatar name={opportunity.companyName} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-medium">{opportunity.title}</p>
                      <StarButton
                        opportunityId={opportunity._id}
                        title={opportunity.title}
                        isStarred={opportunity.isStarred}
                      />
                    </div>
                    <p>{opportunity.companyName}</p>
                  </div>
                </div>
              </td>
              <td>{formatPostedAgo(opportunity._creationTime, now)}</td>
              <td>{formatDeadline(opportunity.deadline, { withYear: true })}</td>
              <td>
                <AvailabilityPill opportunity={opportunity} />
              </td>
              <td>{formatCompensation(opportunity)}</td>
              <td>
                {opportunity.isGated && (
                  <Button type="button" onClick={() => onApply(opportunity._id)}>
                    Apply
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
