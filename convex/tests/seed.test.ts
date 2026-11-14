/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { TableNames } from "../_generated/dataModel";
import schema from "../schema";
import { expectApiError, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");
const paginationOpts = { numItems: 20, cursor: null };

afterEach(() => vi.unstubAllEnvs());

test("seeds demo tables without earnings evidence and preserves existing data on repeat runs", async () => {
  vi.stubEnv("TOMOJI_DEV_SEED", "true");
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      workosId: "unrelated_operator",
      email: "unrelated_operator@example.com",
      firstName: "Unrelated",
      lastName: "Operator",
      role: "operator",
      isActive: true,
    }),
  );

  const first = await t.mutation(internal.seed.run, {});
  const tables = Object.keys(schema.tables) as TableNames[];
  const countRows = () =>
    t.run(async (ctx) =>
      Promise.all(tables.map(async (table) => (await ctx.db.query(table).collect()).length)),
    );
  const counts = await countRows();
  // Synthetic demo posts have no verified earnings clock or X observations.
  // Keep those tables empty rather than inventing payable earnings evidence.
  expect(tables.filter((_, index) => counts[index] === 0).sort()).toEqual([
    "deliverableEarnings",
    "earningCalculations",
    "earningsSchedules",
    "postViewSnapshots",
  ]);
  expect(first.created).toBe(true);

  expect(await t.mutation(internal.seed.run, {})).toEqual({ ...first, created: false });
  expect(await countRows()).toEqual(counts);
  expect(await t.run((ctx) => ctx.db.get("creators", first.creatorId))).toBeTruthy();
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_workosId", (q) => q.eq("workosId", "unrelated_operator"))
        .unique(),
    ),
  ).not.toBeNull();
});

test("dev sign-ins see the same linked fixtures across creator and company screens", async () => {
  vi.stubEnv("TOMOJI_DEV_SEED", "true");
  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "demo_viewer" });
  const asCompany = await seedUser(t, {
    subject: "demo_owner",
    org: { id: "org_demo_owner", role: "admin" },
  });
  const outsider = await seedUser(t, {
    subject: "outside_owner",
    org: { id: "org_outside", role: "admin" },
  });
  const { companyId, creatorId } = await t.mutation(internal.seed.run, {
    creatorEmail: "demo_viewer@example.com",
    companyAdminEmail: "demo_owner@example.com",
  });

  const current = await asCreator.query(api.assignments.listMineSummaries, {
    phase: "current",
    paginationOpts,
  });
  expect(current.page.map((row) => row.queue).sort()).toEqual([
    "approved",
    "changesNeeded",
    "notStarted",
    "review",
  ]);
  const filters = await asCreator.query(api.assignments.listMineFilterOptions, {});
  expect(filters.counts).toEqual({ notStarted: 1, review: 1, changesNeeded: 1, approved: 2 });
  const past = await asCreator.query(api.assignments.listMineSummaries, {
    phase: "past",
    paginationOpts,
  });
  expect(past.page).toMatchObject([{ status: "completed", queue: "approved", next: null }]);

  const revision = current.page.find((row) => row.queue === "changesNeeded")!;
  const drafts = await asCreator.query(api.submissions.list, {
    assignmentId: revision._id,
    deliverableId: revision.next!.id,
    paginationOpts,
  });
  expect(drafts.page).toMatchObject([
    {
      status: "changesRequested",
      reviewerType: "ai",
      aiReview: { status: "completed", failedCriteria: [{ id: "sponsorship" }] },
    },
  ]);
  const submissionId = drafts.page[0]._id;
  expect(await asCompany.query(api.submissions.get, { submissionId })).toMatchObject({
    _id: submissionId,
  });
  await expectApiError(() => outsider.query(api.submissions.get, { submissionId }), "not_found");

  const inReview = current.page.find((row) => row.queue === "review")!;
  const pending = await asCompany.query(api.submissions.list, {
    assignmentId: inReview._id,
    deliverableId: inReview.next!.id,
    paginationOpts,
  });
  expect(pending.page).toMatchObject([{ status: "pending", aiReview: { status: "manualReview" } }]);
  await asCompany.mutation(api.submissions.review, {
    submissionId: pending.page[0]._id,
    review: { status: "approved" },
  });
  expect(
    await asCreator.query(api.submissions.get, { submissionId: pending.page[0]._id }),
  ).toMatchObject({
    status: "approved",
  });

  const { slots, assignments, media, activePost, accounts } = await t.run(async (ctx) => ({
    slots: await ctx.db
      .query("opportunities")
      .withIndex("by_companyId_and_status", (q) => q.eq("companyId", companyId))
      .collect(),
    assignments: await ctx.db.query("assignments").collect(),
    media: await ctx.db.query("mediaUploads").collect(),
    activePost: await ctx.db.query("posts").first(),
    accounts: await ctx.db.query("xAccounts").collect(),
  }));
  for (const slot of slots)
    expect(slot.numFilledSlots).toBe(
      assignments.filter((row) => row.opportunityId === slot._id).length,
    );
  expect(activePost).toMatchObject({ isActive: true, isVerified: true });
  expect(media).toMatchObject([{ status: "pending" }]);
  expect(accounts).toMatchObject([{ status: "reconnect_required" }]);
  expect(accounts[0].creatorId).not.toBe(creatorId);
});

test("requires an explicit deployment opt-in before writing", async () => {
  vi.stubEnv("TOMOJI_DEV_SEED", "false");
  const t = convexTest(schema, modules);
  await expectApiError(
    () => t.mutation(internal.seed.run, {}),
    "invalid_state",
    "dev_seed_disabled",
  );
  expect(await t.run((ctx) => ctx.db.query("users").first())).toBeNull();
});

test("the larger demo catalog can be rerun and never introduces fake filled slots", async () => {
  vi.stubEnv("TOMOJI_DEV_SEED", "true");
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  expect(await t.mutation(internal.seed.more, { count: 3 })).toEqual({ added: 3 });
  expect(await t.mutation(internal.seed.more, { count: 5 })).toEqual({ added: 2 });
  expect(await t.mutation(internal.seed.more, { count: 3 })).toEqual({ added: 0 });
  const catalog = await t.run(async (ctx) => {
    const campaign = await ctx.db.query("campaigns").unique();
    return await ctx.db
      .query("opportunities")
      .withIndex("by_campaignId_and_status", (q) => q.eq("campaignId", campaign!._id))
      .collect();
  });
  const extra = catalog.filter((row) => row.title.startsWith("[Catalog]"));
  expect(extra).toHaveLength(5);
  expect(extra.every((row) => row.numFilledSlots === 0)).toBe(true);
});

test("reset preserves a campaign with the same name when it has no seed marker", async () => {
  vi.stubEnv("TOMOJI_DEV_SEED", "true");
  const t = convexTest(schema, modules);
  const { campaignId } = await t.mutation(internal.seed.run, {});
  const unrelated = await t.run(async (ctx) => {
    const campaign = (await ctx.db.get("campaigns", campaignId))!;
    return await ctx.db.insert("campaigns", {
      companyId: campaign.companyId,
      createdBy: campaign.createdBy,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      budgetCents: campaign.budgetCents,
      startsAt: campaign.startsAt,
    });
  });

  expect(await t.mutation(internal.seed.clearDemo, {})).toMatchObject({ campaigns: 1 });
  expect(await t.run((ctx) => ctx.db.get("campaigns", campaignId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get("campaigns", unrelated))).not.toBeNull();
});
