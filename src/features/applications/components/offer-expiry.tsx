import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "../lib/application-status";
import { formatOfferDeadline } from "../lib/format";
import { formatOfferExpiry, offerTiming } from "../lib/offer";

/** The Expiration date cell: red once an offer is urgent or expired, grey when declined. */
export function OfferExpiry({
  status,
  offerExpiresAt,
  now,
  className,
}: {
  status: ApplicationStatus;
  offerExpiresAt?: number;
  now: number;
  className?: string;
}) {
  const timing = offerTiming(status, offerExpiresAt, now);
  return (
    <span
      title={
        offerExpiresAt === undefined
          ? undefined
          : formatOfferDeadline(offerExpiresAt, { withTime: true })
      }
      className={cn(
        timing === "urgent" || timing === "expired"
          ? "font-medium text-red-700"
          : timing === "declined"
            ? "text-gray-500"
            : "text-gray-950",
        className,
      )}
    >
      {formatOfferExpiry(status, offerExpiresAt, now)}
    </span>
  );
}
