/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  countUnreadNotifications,
  createNotification,
  listNotifications,
  MARK_ALL_READ_BATCH_SIZE,
  markAllNotificationsRead,
  markNotificationRead,
  UNREAD_COUNT_LIMIT,
  type NotificationContent,
} from "../../models/notifications";
import { getUserByWorkosId } from "../../models/users";
import schema from "../../schema";
import { expectApiError, seedGatedOpportunity, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const firstPage = { numItems: 10, cursor: null };

async function seedUserId(t: TestConvex, subject: string): Promise<Id<"users">> {
  await seedUser(t, { subject });
  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    return user._id;
  });
}

async function closedContent(t: TestConvex): Promise<NotificationContent> {
  const { opportunityId } = await seedGatedOpportunity(t);
  return {
    type: "opportunityClosed",
    title: "Moisturizer launch video closed at its deadline",
    target: { kind: "opportunity", opportunityId },
  };
}

async function notify(t: TestConvex, userId: Id<"users">, content: NotificationContent, n = 1) {
  const ids: Id<"notifications">[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(await t.run(async (ctx) => await createNotification(ctx, userId, content)));
  }
  return ids;
}

describe("createNotification", () => {
  test("stores an unread notification for the recipient", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const content = await closedContent(t);

    const [id] = await notify(t, userId, content);

    const stored = await t.run(async (ctx) => await ctx.db.get("notifications", id));
    expect(stored).toMatchObject({ ...content, userId, isRead: false });
  });
});

describe("listNotifications", () => {
  test("lists only the user's notifications, newest first", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const otherId = await seedUserId(t, "creator_b");
    const content = await closedContent(t);
    const [older, newer] = await notify(t, userId, content, 2);
    await notify(t, otherId, content);

    const result = await t.run(
      async (ctx) => await listNotifications(ctx, userId, { paginationOpts: firstPage }),
    );

    expect(result.page.map((n) => n._id)).toEqual([newer, older]);
  });

  test("filters by read state", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const [read, unread] = await notify(t, userId, await closedContent(t), 2);
    await t.run(async (ctx) => await markNotificationRead(ctx, userId, read));

    const list = (isRead: boolean) =>
      t.run(
        async (ctx) => await listNotifications(ctx, userId, { isRead, paginationOpts: firstPage }),
      );

    expect((await list(false)).page.map((n) => n._id)).toEqual([unread]);
    expect((await list(true)).page.map((n) => n._id)).toEqual([read]);
  });
});

describe("countUnreadNotifications", () => {
  test("counts only the user's unread notifications", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const otherId = await seedUserId(t, "creator_b");
    const content = await closedContent(t);
    const [read] = await notify(t, userId, content, 3);
    await notify(t, otherId, content);
    await t.run(async (ctx) => await markNotificationRead(ctx, userId, read));

    expect(await t.run(async (ctx) => await countUnreadNotifications(ctx, userId))).toBe(2);
  });

  test(`stops counting at ${UNREAD_COUNT_LIMIT}`, async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    await notify(t, userId, await closedContent(t), UNREAD_COUNT_LIMIT + 1);

    expect(await t.run(async (ctx) => await countUnreadNotifications(ctx, userId))).toBe(
      UNREAD_COUNT_LIMIT,
    );
  });
});

describe("markNotificationRead", () => {
  test("marks the notification read, and is a no-op when repeated", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const [id] = await notify(t, userId, await closedContent(t));

    await t.run(async (ctx) => await markNotificationRead(ctx, userId, id));
    await t.run(async (ctx) => await markNotificationRead(ctx, userId, id));

    const stored = await t.run(async (ctx) => await ctx.db.get("notifications", id));
    expect(stored?.isRead).toBe(true);
  });

  test("refuses another user's notification as not_found", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const otherId = await seedUserId(t, "creator_b");
    const [id] = await notify(t, otherId, await closedContent(t));

    await expectApiError(
      () => t.run(async (ctx) => await markNotificationRead(ctx, userId, id)),
      "not_found",
    );
    const stored = await t.run(async (ctx) => await ctx.db.get("notifications", id));
    expect(stored?.isRead).toBe(false);
  });
});

describe("markAllNotificationsRead", () => {
  test("marks one batch of the user's unread notifications and reports whether more remain", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUserId(t, "creator_a");
    const otherId = await seedUserId(t, "creator_b");
    const content = await closedContent(t);
    await notify(t, userId, content, MARK_ALL_READ_BATCH_SIZE + 1);
    const [othersId] = await notify(t, otherId, content);

    const markBatch = () => t.run(async (ctx) => await markAllNotificationsRead(ctx, userId));

    expect(await markBatch()).toBe(true);
    expect(await t.run(async (ctx) => await countUnreadNotifications(ctx, userId))).toBe(1);
    expect(await markBatch()).toBe(false);
    expect(await t.run(async (ctx) => await countUnreadNotifications(ctx, userId))).toBe(0);
    const others = await t.run(async (ctx) => await ctx.db.get("notifications", othersId));
    expect(others?.isRead).toBe(false);
  });
});
