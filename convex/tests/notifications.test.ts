/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createNotification, MARK_ALL_READ_BATCH_SIZE } from "../models/notifications";
import { getUserByWorkosId } from "../models/users";
import schema from "../schema";
import { expectApiError, seedGatedOpportunity, seedUser, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const firstPage = { numItems: 10, cursor: null };

/** Seeds a user with `count` unread notifications and returns their client. */
async function seedNotified(t: TestConvex, subject: string, count = 1) {
  const asUser = await seedUser(t, { subject });
  const { opportunityId } = await seedGatedOpportunity(t, {
    subject: `${subject}_company`,
    orgId: `org_${subject}`,
  });
  const notificationIds = await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    const ids: Id<"notifications">[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(
        await createNotification(ctx, user._id, {
          type: "opportunityClosed",
          title: "Moisturizer launch video closed at its deadline",
          target: { kind: "opportunity", opportunityId },
        }),
      );
    }
    return ids;
  });
  return { asUser, notificationIds };
}

describe("notifications.list", () => {
  test("lists only the caller's notifications", async () => {
    const t = convexTest(schema, modules);
    const { asUser, notificationIds } = await seedNotified(t, "creator_a");
    await seedNotified(t, "creator_b");

    const result = await asUser.query(api.notifications.list, { paginationOpts: firstPage });

    expect(result.page.map((n) => n._id)).toEqual(notificationIds);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.query(api.notifications.list, { paginationOpts: firstPage }),
      "not_authenticated",
    );
  });
});

describe("notifications.unreadCount", () => {
  test("counts the caller's unread notifications", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedNotified(t, "creator_a", 2);
    await seedNotified(t, "creator_b");

    expect(await asUser.query(api.notifications.unreadCount, {})).toBe(2);
  });
});

describe("notifications.markRead", () => {
  test("marks the caller's notification read", async () => {
    const t = convexTest(schema, modules);
    const { asUser, notificationIds } = await seedNotified(t, "creator_a");

    await asUser.mutation(api.notifications.markRead, { notificationId: notificationIds[0] });

    expect(await asUser.query(api.notifications.unreadCount, {})).toBe(0);
  });

  test("refuses another user's notification as not_found", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedNotified(t, "creator_a");
    const { notificationIds: othersIds } = await seedNotified(t, "creator_b");

    await expectApiError(
      () => asUser.mutation(api.notifications.markRead, { notificationId: othersIds[0] }),
      "not_found",
    );
  });
});

describe("notifications.markAllRead", () => {
  test("marks every unread notification, continuing past one batch", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    try {
      const { asUser } = await seedNotified(t, "creator_a", MARK_ALL_READ_BATCH_SIZE + 5);
      const { asUser: asOther } = await seedNotified(t, "creator_b");

      await asUser.mutation(api.notifications.markAllRead, {});
      expect(await asUser.query(api.notifications.unreadCount, {})).toBe(5);

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
      expect(await asUser.query(api.notifications.unreadCount, {})).toBe(0);
      expect(await asOther.query(api.notifications.unreadCount, {})).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
