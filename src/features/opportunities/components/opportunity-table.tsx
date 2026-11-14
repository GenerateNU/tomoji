import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { feedTags } from "../lib/feed-status";
import { formatDeadline, formatPay, formatPostedAgo } from "../lib/format";
import type { FeedOpportunity } from "../lib/types";
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
    <Table bare className="min-w-[880px]">
      <TableHeader>
        <TableHead className="w-[30%]">Opportunity</TableHead>
        <TableHead className="w-[17%]">Company</TableHead>
        <TableHead className="w-28">Posted</TableHead>
        {/* Dates stay whole, so this column doesn't shrink. */}
        <TableHead className="w-44">Deadline</TableHead>
        <TableHead className="w-48">Type</TableHead>
        <TableHead className="w-44">Compensation</TableHead>
      </TableHeader>
      <TableBody>
        {opportunities.map((opportunity) => {
          const [access] = feedTags(opportunity);
          return (
            <TableRow key={opportunity._id}>
              <TableCell type="custom">
                <button
                  type="button"
                  onClick={() => onOpen(opportunity._id)}
                  className={cn(
                    "min-w-0 cursor-pointer truncate rounded-xs text-left font-medium underline-offset-4 hover:underline",
                    focusRing,
                  )}
                >
                  {opportunity.title}
                </button>
                <StarButton
                  opportunityId={opportunity._id}
                  title={opportunity.title}
                  isStarred={opportunity.isStarred}
                />
              </TableCell>
              <TableCell type="custom">
                <CompanyAvatar name={opportunity.companyName} size="xs" />
                <span className="truncate">{opportunity.companyName}</span>
              </TableCell>
              <TableCell>{formatPostedAgo(opportunity._creationTime, now)}</TableCell>
              <TableCell>{formatDeadline(opportunity.deadline, { withYear: true })}</TableCell>
              <TableCell type="custom">
                <Badge size="md">{access.label}</Badge>
              </TableCell>
              <TableCell>{formatPay(opportunity, " • ")}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
