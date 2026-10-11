import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import type { notificationTargetKind } from "../schemas/notifications.schema";

type NotificationType = Doc<"notifications">["type"];
type NotificationTarget = Doc<"notifications">["target"];

/**
 * What a notification says and opens; the recipient and read state are set
 * here. Each type only accepts the target kind `notificationTargetKind` maps it to.
 */
export type NotificationContent = {
  [Type in NotificationType]: {
    type: Type;
    title: string;
    body?: string;
    target: Extract<NotificationTarget, { kind: (typeof notificationTargetKind)[Type] }>;
  };
}[NotificationType];

/** The unread count stops here; the client shows anything at the limit as "99+". */
export const UNREAD_COUNT_LIMIT = 100;

/** How many notifications one `markAllNotificationsRead` transaction marks. */
export const MARK_ALL_READ_BATCH_SIZE = 100;

/**
 * Inserts an unread notification for one user. Call it from the mutation that
 * makes the change, so the notification commits or rolls back with it.
 */
export async function createNotification(
  ctx: MutationCtx,
  userId: Id<"users">,
  content: NotificationContent,
): Promise<Id<"notifications">> {
  return await ctx.db.insert("notifications", { ...content, userId, isRead: false });
}

// The recipient helpers below skip a missing recipient instead of throwing: a
// notification must never block the change it reports.

/** Notifies the creator's user. */
export async function notifyCreator(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  content: NotificationContent,
): Promise<void> {
  const creator = await ctx.db.get("creators", creatorId);
  if (creator !== null) await createNotification(ctx, creator.userId, content);
}

/** Notifies the company member who created the opportunity. Other members are not notified. */
export async function notifyOpportunityCreator(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
  content: NotificationContent,
): Promise<void> {
  const member = await ctx.db.get("companyUsers", opportunity.createdBy);
  if (member !== null) await createNotification(ctx, member.userId, content);
}

/** Notifies the company member who created the campaign. Other members are not notified. */
export async function notifyCampaignCreator(
  ctx: MutationCtx,
  campaign: Doc<"campaigns">,
  content: NotificationContent,
): Promise<void> {
  const member = await ctx.db.get("companyUsers", campaign.createdBy);
  if (member !== null) await createNotification(ctx, member.userId, content);
}

/** Lists the user's notifications newest first, optionally only read or unread ones. */
export async function listNotifications(
  ctx: QueryCtx,
  userId: Id<"users">,
  args: { isRead?: boolean; paginationOpts: PaginationOptions },
): Promise<PaginationResult<Doc<"notifications">>> {
  const { isRead } = args;
  const query =
    isRead === undefined
      ? ctx.db.query("notifications").withIndex("by_userId", (q) => q.eq("userId", userId))
      : ctx.db
          .query("notifications")
          .withIndex("by_userId_and_isRead", (q) => q.eq("userId", userId).eq("isRead", isRead));
  return await query.order("desc").paginate(args.paginationOpts);
}

/** Counts the user's unread notifications, up to `UNREAD_COUNT_LIMIT`. */
export async function countUnreadNotifications(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<number> {
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_isRead", (q) => q.eq("userId", userId).eq("isRead", false))
    .take(UNREAD_COUNT_LIMIT);
  return unread.length;
}

/**
 * Marks one of the user's notifications read. Already-read notifications are
 * left as they are, so repeated clicks are harmless.
 *
 * @throws `not_found` if the notification does not exist or is not the user's.
 */
export async function markNotificationRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  notificationId: Id<"notifications">,
): Promise<void> {
  const notification = await ctx.db.get("notifications", notificationId);
  if (notification === null || notification.userId !== userId) {
    throw apiError("not_found", { resource: "notification" });
  }
  if (!notification.isRead) {
    await ctx.db.patch("notifications", notificationId, { isRead: true });
  }
}

/**
 * Marks one bounded batch of the user's unread notifications read and reports
 * whether more may remain. Only notifications created at or before
 * `createdUpTo` are marked.
 */
export async function markAllNotificationsRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  createdUpTo: number,
): Promise<boolean> {
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_userId_and_isRead", (q) =>
      q.eq("userId", userId).eq("isRead", false).lte("_creationTime", createdUpTo),
    )
    .take(MARK_ALL_READ_BATCH_SIZE + 1);
  for (const notification of unread.slice(0, MARK_ALL_READ_BATCH_SIZE)) {
    await ctx.db.patch("notifications", notification._id, { isRead: true });
  }
  return unread.length > MARK_ALL_READ_BATCH_SIZE;
}
