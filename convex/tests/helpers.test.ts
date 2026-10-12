/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { apiError } from "../lib/errors";
import schema from "../schema";
import {
  campaignArgs,
  expectApiError,
  seedCampaign,
  seedAssignmentFixture,
  submissionArgs,
  submissionDraftFields,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

test("reason-aware API assertions execute the operation only once", async () => {
  let calls = 0;
  await expectApiError(
    async () => {
      calls += 1;
      throw apiError("invalid_state", { reason: "assignment_not_active" });
    },
    "invalid_state",
    "assignment_not_active",
  );
  expect(calls).toBe(1);
});

test("API assertions reject the wrong reason even when the code matches", async () => {
  await expect(
    expectApiError(
      async () => {
        throw apiError("invalid_state", { reason: "actual_reason" });
      },
      "invalid_state",
      "expected_reason",
    ),
  ).rejects.toThrow();
});

test("API assertions reject the wrong code even when the reason matches", async () => {
  await expect(
    expectApiError(
      async () => {
        throw apiError("conflict", { reason: "expected_reason" });
      },
      "invalid_state",
      "expected_reason",
    ),
  ).rejects.toThrow();
});

test("API assertions reject an operation that unexpectedly succeeds", async () => {
  await expect(expectApiError(async () => null, "invalid_state")).rejects.toThrow();
});

test("campaign argument overrides remain unvalidated for negative and legacy fixtures", () => {
  const args = campaignArgs({ title: "", budgetCents: -1, startsAt: 0, endsAt: 1 });
  expect(args).toMatchObject({ title: "", budgetCents: -1, startsAt: 0, endsAt: 1 });
  expect(args).not.toHaveProperty("companyId");
  expect(args).not.toHaveProperty("createdBy");
});

test("shared campaign seeding preserves its original current-time and audience defaults", async () => {
  const t = convexTest(schema, modules);
  const before = Date.now();
  const { campaignId } = await seedCampaign(t, { subject: "fixture_defaults" });
  const campaign = await t.run((ctx) => ctx.db.get("campaigns", campaignId));
  expect(campaign?.audience).toBe("Skincare enthusiasts");
  expect(campaign?.startsAt).toBeGreaterThanOrEqual(before);
  expect(campaign?.startsAt).toBeLessThanOrEqual(Date.now());
});

test("submission arguments are fresh and preserve explicit scenario overrides", async () => {
  const t = convexTest(schema, modules);
  const { assignmentId } = await seedAssignmentFixture(t);
  const args = submissionArgs(assignmentId, { draftUrl: "invalid-url" });
  expect(args.draftUrl).toBe("invalid-url");
  args.draftDescription = "changed by this test";
  expect(submissionArgs(assignmentId)).toEqual({ assignmentId, ...submissionDraftFields });
});
