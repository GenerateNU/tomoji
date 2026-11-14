import type { Doc } from "@convex/_generated/dataModel";

/** Groups the loaded pages in order using the viewer's local calendar, not 24-hour offsets. */
export function groupByDate(notifications: Doc<"notifications">[], now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const groups = new Map<string, { label: string; notifications: Doc<"notifications">[] }>();
  for (const notification of notifications) {
    const date = new Date(notification._creationTime);
    const day = date.toDateString();
    const label =
      day === now.toDateString()
        ? "Today"
        : day === yesterday.toDateString()
          ? "Yesterday"
          : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    if (!groups.has(day)) groups.set(day, { label, notifications: [] });
    groups.get(day)!.notifications.push(notification);
  }
  return [...groups.values()];
}
