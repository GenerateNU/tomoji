import type { Metadata } from "next";
import { NotificationsInbox } from "@/features/notifications/components/notifications-inbox";

export const metadata: Metadata = { title: "Notifications · Tomoji" };

/** The authenticated notification inbox route. */
export default function NotificationsPage() {
  return <NotificationsInbox />;
}
