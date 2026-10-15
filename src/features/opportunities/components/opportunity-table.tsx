import type { Id } from "@convex/_generated/dataModel";
import { formatCompensation, formatDeadline, formatPostedAgo } from "../lib/format";
import type { FeedOpportunity } from "../lib/types";
import { AvailabilityPill } from "./availability-pill";
import { CompanyAvatar } from "./company-avatar";
import { StarButton } from "./star-button";

/** List view of the creator feed: one row per opportunity. */
export function OpportunityTable({
  opportunities,
  now,
  onOpen,
}: {
  opportunities: FeedOpportunity[];
  now: number;
  onOpen: (opportunityId: Id<"opportunities">) => void;
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
                      <button
                        type="button"
                        onClick={() => onOpen(opportunity._id)}
                        className="text-left text-xl font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
                      >
                        {opportunity.title}
                      </button>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
