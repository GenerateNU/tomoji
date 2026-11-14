import type { Doc } from "@convex/_generated/dataModel";

export { formatCompensation } from "@/lib/money";

/**
 * The next deadline that matters to the creator: how long they have to answer
 * an offer, or until a pending application's opportunity closes. Finished
 * applications have none.
 */
export function applicationExpiresAt(
  application: Pick<Doc<"applications">, "status" | "offerExpiresAt">,
  opportunityDeadline: number | undefined,
): number | null {
  switch (application.status) {
    case "offered":
      return application.offerExpiresAt ?? null;
    case "pending":
      return opportunityDeadline ?? null;
    default:
      return null;
  }
}
