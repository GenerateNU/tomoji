/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { notificationTargetKind } from "../schemas/notifications.schema";
import { seedAiReviewFixture, seedCreatorId, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

test("clearing seeded submissions also removes their AI review attempts and preserves accounts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);

  await t.mutation(internal.seed.clear, {});

  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get("users", fixture.creatorUserId))).not.toBeNull();
  expect(await t.mutation(internal.seed.clear, {})).toEqual({ cleared: 0 });
});

test("seeds every notification type whose page exists, with a target that exists", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "seed_admin", org: { id: "org_seed", role: "admin" } });
  await seedCreatorId(t, "seed_creator");

  await t.mutation(internal.seed.run, {});

  const notifications = await t.run((ctx) => ctx.db.query("notifications").collect());
  // Assignment, submission, and dispute pages don't exist yet.
  const linkable = new Set(["application", "opportunity", "campaign"]);
  const expected = Object.entries(notificationTargetKind)
    .filter(([, kind]) => linkable.has(kind))
    .map(([type]) => type);
  expect(new Set(notifications.map((n) => n.type))).toEqual(new Set(expected));
  for (const { type, target } of notifications) {
    expect(target.kind).toBe(notificationTargetKind[type]);
    const id =
      target.kind === "application"
        ? target.applicationId
        : target.kind === "assignment"
          ? target.assignmentId
          : target.kind === "submission"
            ? target.submissionId
            : target.kind === "opportunity"
              ? target.opportunityId
              : target.kind === "campaign"
                ? target.campaignId
                : target.disputeId;
    expect(await t.run((ctx) => ctx.db.get(id))).not.toBeNull();
  }
  expect(notifications.some((n) => n.isRead) && notifications.some((n) => !n.isRead)).toBe(true);
});
