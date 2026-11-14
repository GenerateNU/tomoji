/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedCreatorId,
  seedGatedOpportunity,
  seedOperator,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const firstPage = { numItems: 10, cursor: null };

/** Seeds an opportunity and a creator client that has applied to it. */
async function seedApplication(t: TestConvex) {
  const seeded = await seedGatedOpportunity(t);
  await seedCreatorId(t, "creator_a");
  const asCreator = t.withIdentity(workosIdentity({ subject: "creator_a" }));
  const applicationId = await asCreator.mutation(api.applications.create, {
    opportunityId: seeded.opportunityId,
    note: "I film daily.",
  });
  return { ...seeded, asCreator, applicationId };
}

describe("applications.create", () => {
  test("creates a pending application for the calling creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId, opportunityId } = await seedApplication(t);

    const application = await asCreator.query(api.applications.get, {
      applicationId,
    });

    expect(application).toMatchObject({
      opportunityId,
      note: "I film daily.",
      status: "pending",
    });
  });

  test("accepts an application without a note", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);
    const asCreator = await seedUser(t, { subject: "creator_a" });

    const applicationId = await asCreator.mutation(api.applications.create, {
      opportunityId,
    });

    const application = await asCreator.query(api.applications.get, {
      applicationId,
    });
    expect(application.status).toBe("pending");
    expect(application).not.toHaveProperty("note");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedGatedOpportunity(t);

    await expectApiError(
      () => t.mutation(api.applications.create, { opportunityId, note: "Hi" }),
      "not_authenticated",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId } = await seedGatedOpportunity(t);

    await expectApiError(
      () =>
        asCompany.mutation(api.applications.create, {
          opportunityId,
          note: "Hi",
        }),
      "forbidden",
    );
  });
});

describe("applications.get", () => {
  test("returns the application to the owning company's members", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, applicationId } = await seedApplication(t);
    const asTeammate = await seedUser(t, {
      subject: "teammate",
      org: { id: "org_acme" },
    });

    expect(await asCompany.query(api.applications.get, { applicationId })).toMatchObject({
      _id: applicationId,
    });
    expect(await asTeammate.query(api.applications.get, { applicationId })).toMatchObject({
      _id: applicationId,
    });
  });

  test("returns the application to an operator", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asOperator = await seedOperator(t, "operator");

    expect(await asOperator.query(api.applications.get, { applicationId })).toMatchObject({
      _id: applicationId,
    });
  });

  test("hides the application from other creators and companies", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asOtherCreator = await seedUser(t, { subject: "creator_b" });
    const { asCompany: asOtherCompany } = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () => asOtherCreator.query(api.applications.get, { applicationId }),
      "not_found",
    );
    await expectApiError(
      () => asOtherCompany.query(api.applications.get, { applicationId }),
      "not_found",
    );
  });

  test("rejects a caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.query(api.applications.get, { applicationId }),
      "forbidden",
    );
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);

    await expectApiError(
      () => t.query(api.applications.get, { applicationId }),
      "not_authenticated",
    );
  });
});

describe("applications.list", () => {
  test("lists applications to the company's opportunity for any teammate", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, applicationId } = await seedApplication(t);
    const asTeammate = await seedUser(t, {
      subject: "teammate",
      org: { id: "org_acme" },
    });

    const result = await asTeammate.query(api.applications.list, {
      opportunityId,
      paginationOpts: firstPage,
    });

    expect(result.page.map((application) => application._id)).toEqual([applicationId]);
  });

  test("hides another company's opportunity as not found", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedApplication(t);
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () =>
        other.asCompany.query(api.applications.list, {
          opportunityId,
          paginationOpts: firstPage,
        }),
      "not_found",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, asCreator } = await seedApplication(t);

    await expectApiError(
      () =>
        asCreator.query(api.applications.list, {
          opportunityId,
          paginationOpts: firstPage,
        }),
      "forbidden",
    );
  });

  test("rejects a caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedApplication(t);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () =>
        asWrongOrg.query(api.applications.list, {
          opportunityId,
          paginationOpts: firstPage,
        }),
      "forbidden",
    );
  });
});

describe("applications.offer", () => {
  test("sends an offer the creator can then see", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, asCreator, applicationId } = await seedApplication(t);

    const offered = await asCompany.mutation(api.applications.offer, {
      applicationId,
    });

    expect(offered).toMatchObject({ _id: applicationId, status: "offered" });
    expect(await asCreator.query(api.applications.get, { applicationId })).toMatchObject({
      status: "offered",
      offerExpiresAt: offered.offerExpiresAt,
    });
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () => other.asCompany.mutation(api.applications.offer, { applicationId }),
      "not_found",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId } = await seedApplication(t);

    await expectApiError(
      () => asCreator.mutation(api.applications.offer, { applicationId }),
      "forbidden",
    );
  });
});

describe("applications.reject", () => {
  test("rejects a pending application", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, asCreator, applicationId } = await seedApplication(t);

    const rejected = await asCompany.mutation(api.applications.reject, {
      applicationId,
    });

    expect(rejected).toMatchObject({ _id: applicationId, status: "rejected" });
    expect(await asCreator.query(api.applications.get, { applicationId })).toMatchObject({
      status: "rejected",
    });
  });

  test("hides another company's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const other = await seedGatedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () => other.asCompany.mutation(api.applications.reject, { applicationId }),
      "not_found",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId } = await seedApplication(t);

    await expectApiError(
      () => asCreator.mutation(api.applications.reject, { applicationId }),
      "forbidden",
    );
  });
});

/** Seeds an application from `creator_a` that the company has offered. */
async function seedOfferedApplication(t: TestConvex) {
  const seeded = await seedApplication(t);
  await seeded.asCompany.mutation(api.applications.offer, {
    applicationId: seeded.applicationId,
  });
  return seeded;
}

describe("applications.accept", () => {
  test("accepts the caller's offer, visible to the company", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, asCreator, applicationId } = await seedOfferedApplication(t);

    const accepted = await asCreator.mutation(api.applications.accept, {
      applicationId,
      acceptedTerms: true,
    });

    expect(accepted).toMatchObject({
      application: { _id: applicationId, status: "accepted" },
      assignmentId: expect.any(String),
    });
    expect(await asCompany.query(api.applications.get, { applicationId })).toMatchObject({
      status: "accepted",
    });
    expect(
      await asCompany.query(api.assignments.get, { assignmentId: accepted.assignmentId }),
    ).toMatchObject({ _id: accepted.assignmentId, status: "active" });
  });

  test("refuses an offer with a review policy unless acceptedTerms is true", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, asCreator, applicationId } = await seedOfferedApplication(t);

    await expectApiError(
      () => asCreator.mutation(api.applications.accept, { applicationId }),
      "invalid_state",
      "terms_not_accepted",
    );
    expect(await asCompany.query(api.applications.get, { applicationId })).toMatchObject({
      status: "offered",
    });
  });

  test("hides another creator's offer as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedOfferedApplication(t);
    const asOther = await seedUser(t, { subject: "creator_b" });

    await expectApiError(
      () => asOther.mutation(api.applications.accept, { applicationId }),
      "not_found",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, applicationId } = await seedOfferedApplication(t);

    await expectApiError(
      () => asCompany.mutation(api.applications.accept, { applicationId }),
      "forbidden",
    );
  });
});

describe("applications.decline", () => {
  test("declines the caller's offer", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId } = await seedOfferedApplication(t);

    const declined = await asCreator.mutation(api.applications.decline, {
      applicationId,
    });

    expect(declined).toMatchObject({ _id: applicationId, status: "declined" });
  });

  test("hides another creator's offer as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedOfferedApplication(t);
    const asOther = await seedUser(t, { subject: "creator_b" });

    await expectApiError(
      () => asOther.mutation(api.applications.decline, { applicationId }),
      "not_found",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, applicationId } = await seedOfferedApplication(t);

    await expectApiError(
      () => asCompany.mutation(api.applications.decline, { applicationId }),
      "forbidden",
    );
  });
});

describe("applications.searchMine", () => {
  const searchArgs = { tab: "applications", page: 1, pageSize: 10 } as const;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  let sequence = 0;

  /** Seeds an opportunity at its own company and has the creator apply through the route. */
  async function applyTo(
    t: TestConvex,
    asCreator: ReturnType<TestConvex["withIdentity"]>,
    title: string,
  ) {
    sequence += 1;
    const seeded = await seedGatedOpportunity(t, {
      subject: `search_owner_${sequence}`,
      orgId: `org_search_${sequence}`,
      opportunity: { title },
    });
    vi.setSystemTime(Date.now() + 1000);
    const applicationId = await asCreator.mutation(api.applications.create, {
      opportunityId: seeded.opportunityId,
    });
    return { ...seeded, applicationId };
  }

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(
      () => t.query(api.applications.searchMine, searchArgs),
      "not_authenticated",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany } = await seedGatedOpportunity(t);

    await expectApiError(
      () => asCompany.query(api.applications.searchMine, searchArgs),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "operator");

    await expectApiError(
      () => asOperator.query(api.applications.searchMine, searchArgs),
      "forbidden",
    );
  });

  test("lists only the calling creator's applications", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });
    const asOther = await seedUser(t, { subject: "creator_b" });
    const mine = await applyTo(t, asCreator, "Mine");
    await applyTo(t, asOther, "Theirs");

    const result = await asCreator.query(api.applications.searchMine, searchArgs);

    expect(result.rows).toMatchObject([{ applicationId: mine.applicationId, title: "Mine" }]);
    expect(result.totalCount).toBe(1);
    expect(result.counts.applications).toEqual({ count: 1, isCapped: false });
  });

  test("starring through the route marks the row, and the starred filter keeps only it", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });
    const starred = await applyTo(t, asCreator, "Starred");
    await applyTo(t, asCreator, "Plain");
    await asCreator.mutation(api.opportunities.star, {
      opportunityId: starred.opportunityId,
    });

    const all = await asCreator.query(api.applications.searchMine, {
      ...searchArgs,
      sort: { key: "name", direction: "ascending" },
    });
    const onlyStarred = await asCreator.query(api.applications.searchMine, {
      ...searchArgs,
      starred: true,
    });

    expect(all.rows.map((row) => [row.title, row.isStarred])).toEqual([
      ["Plain", false],
      ["Starred", true],
    ]);
    expect(onlyStarred.rows).toMatchObject([{ title: "Starred", isStarred: true }]);
  });

  test("searches and sorts by the requested arguments", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });
    await applyTo(t, asCreator, "Serum B");
    await applyTo(t, asCreator, "Serum A");
    await applyTo(t, asCreator, "Sneakers");

    const result = await asCreator.query(api.applications.searchMine, {
      ...searchArgs,
      search: " serum ",
      sort: { key: "name", direction: "ascending" },
    });

    expect(result.rows.map((row) => row.title)).toEqual(["Serum A", "Serum B"]);
  });

  test("a search over 100 characters is refused as invalid_state", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });

    await expectApiError(
      () =>
        asCreator.query(api.applications.searchMine, {
          ...searchArgs,
          search: "a".repeat(101),
        }),
      "invalid_state",
      "search_too_long",
    );
  });

  test.each([
    { name: "page 0", args: { page: 0 }, reason: "invalid_page" },
    { name: "a fractional page", args: { page: 1.5 }, reason: "invalid_page" },
    {
      name: "page size 51",
      args: { pageSize: 51 },
      reason: "invalid_page_size",
    },
  ])("refuses $name as invalid_state", async ({ args, reason }) => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });

    await expectApiError(
      () =>
        asCreator.query(api.applications.searchMine, {
          ...searchArgs,
          ...args,
        }),
      "invalid_state",
      reason,
    );
  });

  test("refuses an unknown tab", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });

    await expect(
      asCreator.query(api.applications.searchMine, {
        ...searchArgs,
        // @ts-expect-error A made-up tab is not part of the contract.
        tab: "archived",
      }),
    ).rejects.toThrow(/got `"archived"`/);
  });

  test("the accepted tab lists only the caller's accepted applications, newest accepted first", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });
    const asOther = await seedUser(t, { subject: "creator_b" });
    const older = await applyTo(t, asCreator, "Older");
    const newer = await applyTo(t, asCreator, "Newer");
    await applyTo(t, asCreator, "Still pending");
    const theirs = await applyTo(t, asOther, "Theirs");
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch("applications", older.applicationId, {
        status: "accepted",
        offerAcceptedAt: now - 3 * 24 * 60 * 60 * 1000,
      });
      await ctx.db.patch("applications", newer.applicationId, {
        status: "accepted",
        offerAcceptedAt: now - 60 * 60 * 1000,
      });
      await ctx.db.patch("applications", theirs.applicationId, {
        status: "accepted",
        offerAcceptedAt: now - 60 * 60 * 1000,
      });
    });

    const result = await asCreator.query(api.applications.searchMine, {
      ...searchArgs,
      tab: "accepted",
    });

    expect(result.tab).toBe("accepted");
    expect(result.rows).toMatchObject([
      {
        applicationId: newer.applicationId,
        title: "Newer",
        status: "accepted",
        offerAcceptedAt: now - 60 * 60 * 1000,
      },
      {
        applicationId: older.applicationId,
        title: "Older",
        status: "accepted",
        offerAcceptedAt: now - 3 * 24 * 60 * 60 * 1000,
      },
    ]);
    expect(result.counts.accepted).toEqual({ count: 2, isCapped: false });
    expect(result.counts.applications).toEqual({ count: 1, isCapped: false });
  });

  test("the offers tab lists only the caller's offers, soonest expiry first", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });
    const asOther = await seedUser(t, { subject: "creator_b" });
    const later = await applyTo(t, asCreator, "Later");
    const sooner = await applyTo(t, asCreator, "Sooner");
    await applyTo(t, asCreator, "Still pending");
    const theirs = await applyTo(t, asOther, "Theirs");
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch("applications", later.applicationId, {
        status: "offered",
        offerExpiresAt: now + 3 * 24 * 60 * 60 * 1000,
      });
      await ctx.db.patch("applications", sooner.applicationId, {
        status: "offered",
        offerExpiresAt: now + 60 * 60 * 1000,
      });
      await ctx.db.patch("applications", theirs.applicationId, {
        status: "offered",
        offerExpiresAt: now + 60 * 60 * 1000,
      });
    });

    const result = await asCreator.query(api.applications.searchMine, {
      ...searchArgs,
      tab: "offers",
    });

    expect(result.tab).toBe("offers");
    expect(result.rows).toMatchObject([
      {
        applicationId: sooner.applicationId,
        title: "Sooner",
        status: "offered",
      },
      { applicationId: later.applicationId, title: "Later", status: "offered" },
    ]);
    expect(result.counts.offers).toEqual({ count: 2, isCapped: false });
    expect(result.counts.applications).toEqual({ count: 1, isCapped: false });
  });

  test("pages through the rows", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator_a" });
    for (let i = 1; i <= 4; i++) await applyTo(t, asCreator, `Row ${i}`);

    const result = await asCreator.query(api.applications.searchMine, {
      ...searchArgs,
      page: 2,
      pageSize: 3,
    });

    expect(result.rows.map((row) => row.title)).toEqual(["Row 1"]);
    expect(result).toMatchObject({
      page: 2,
      pageSize: 3,
      totalCount: 4,
      pageCount: 2,
    });
  });
});

describe("applications.getMineDetail", () => {
  test("returns the caller's offer with its brief and flags", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, asCreator, applicationId, opportunityId } = await seedApplication(t);
    const offered = await asCompany.mutation(api.applications.offer, {
      applicationId,
    });

    const detail = await asCreator.query(api.applications.getMineDetail, {
      applicationId,
    });

    expect(detail).toMatchObject({
      applicationId,
      status: "offered",
      offerExpiresAt: offered.offerExpiresAt,
      canAccept: true,
      canDecline: true,
      termsRequired: true,
      opportunity: { _id: opportunityId, title: "Moisturizer launch video" },
    });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);

    await expectApiError(
      () => t.query(api.applications.getMineDetail, { applicationId }),
      "not_authenticated",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, applicationId } = await seedApplication(t);

    await expectApiError(
      () => asCompany.query(api.applications.getMineDetail, { applicationId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asOperator = await seedOperator(t, "operator");

    await expectApiError(
      () => asOperator.query(api.applications.getMineDetail, { applicationId }),
      "forbidden",
    );
  });

  test("hides another creator's application as not found", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asOther = await seedUser(t, { subject: "creator_b" });

    await expectApiError(
      () => asOther.query(api.applications.getMineDetail, { applicationId }),
      "not_found",
    );
  });

  test("reports not found for the application when its opportunity was deleted", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId, opportunityId } = await seedApplication(t);
    await t.run((ctx) => ctx.db.delete("opportunities", opportunityId));

    await expect(
      asCreator.query(api.applications.getMineDetail, { applicationId }),
    ).rejects.toMatchObject({
      data: { code: "not_found", resource: "application" },
    });
  });
});
