import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authedMutation, authedQuery } from "./lib/functions";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./models/notifications";
import schema from "./schema";

// There is no public create: notifications are inserted only by the server-side
// mutations that cause them, so a client cannot notify another user.

/** Lists the caller's notifications newest first, optionally only read or unread ones. */
export const list = authedQuery({
  args: { isRead: v.optional(v.boolean()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("notifications")),
  handler: async (ctx, args) => {
    return await listNotifications(ctx, ctx.user._id, args);
  },
});

/** Counts the caller's unread notifications, stopping at 100; show 100 as "99+". */
export const unreadCount = authedQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    return await countUnreadNotifications(ctx, ctx.user._id);
  },
});

/**
 * Marks one of the caller's notifications read. Repeating it is harmless.
 *
 * @throws `not_found` if the notification does not exist or is not the caller's.
 */
export const markRead = authedMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markNotificationRead(ctx, ctx.user._id, args.notificationId);
    return null;
  },
});

/** Marks all of the caller's notifications read, finishing large backlogs in scheduled batches. */
export const markAllRead = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await markBatchAndContinue(ctx, ctx.user._id, Date.now());
    return null;
  },
});

/** Continues `markAllRead` for a user whose backlog did not fit in one batch. */
export const continueMarkingAllRead = internalMutation({
  args: { userId: v.id("users"), createdUpTo: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markBatchAndContinue(ctx, args.userId, args.createdUpTo);
    return null;
  },
});

async function markBatchAndContinue(
  ctx: MutationCtx,
  userId: Id<"users">,
  createdUpTo: number,
): Promise<void> {
  const hasMore = await markAllNotificationsRead(ctx, userId, createdUpTo);
  if (hasMore) {
    await ctx.scheduler.runAfter(0, internal.notifications.continueMarkingAllRead, {
      userId,
      createdUpTo,
    });
  }
}
