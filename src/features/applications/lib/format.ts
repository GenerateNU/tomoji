export { formatCompensation } from "@/lib/money";
export { formatRelativeTime } from "@/lib/relative-time";

/** "November 16", or "November 16, 2:30 PM" with `withTime`, in the viewer's time zone. */
export function formatOfferDeadline(timestamp: number, { withTime = false } = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(timestamp);
}
