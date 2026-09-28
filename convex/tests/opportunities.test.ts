/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { deactivateUser } from "../models/users";
import schema from "../schema";
import {
  expectApiError,
  opportunityArgs,
  seedCampaign,
  seedOperator,
  seedOpportunity,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("opportunities.close", () => {
  test("lets a company member close an opportunity and hides its brief from creators", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_member", role: "member" });
    const asCreator = await seedUser(t, { subject: "close_creator" });
    const before = await asCreator.query(api.opportunities.get, {
      opportunityId: owner.opportunityId,
    });
    const result = await owner.asCompany.mutation(api.opportunities.close, {
      opportunityId: owner.opportunityId,
    });
    expect(result).toEqual({ ...before, status: "closed" });
    await expectApiError(
      () => asCreator.query(api.opportunities.get, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    const feed = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page).toEqual([]);
    expect(feed.isDone).toBe(true);
  });

  test("lets a company admin close a paused opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_admin", role: "admin" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "paused" }),
    );
    const result = await owner.asCompany.mutation(api.opportunities.close, {
      opportunityId: owner.opportunityId,
    });
    expect(result.status).toBe("closed");
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner" });
    await expectApiError(
      () => t.mutation(api.opportunities.close, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner" });
    const asCreator = await seedUser(t, { subject: "close_creator" });
    await expectApiError(
      () => asCreator.mutation(api.opportunities.close, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner" });
    const asOperator = await seedOperator(t, "close_operator");
    await expectApiError(
      () => asOperator.mutation(api.opportunities.close, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("conceals another company's opportunity and leaves it unchanged", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner" });
    const other = await seedCampaign(t, { subject: "close_other", orgId: "org_other" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await expectApiError(
      () =>
        other.asCompany.mutation(api.opportunities.close, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.close, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects a deactivated company member", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner" });
    await t.run(async (ctx) => await deactivateUser(ctx, "close_owner"));
    await expectApiError(
      () =>
        owner.asCompany.mutation(api.opportunities.close, { opportunityId: owner.opportunityId }),
      "account_deactivated",
    );
  });

  test("rejects edits bundled into a close request", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "close_owner" });
    const args = { opportunityId: owner.opportunityId, title: "Changed title" };
    await expect(owner.asCompany.mutation(api.opportunities.close, args)).rejects.toThrow(
      "Unexpected field `title`",
    );
  });
});

describe("opportunities.closeExpired", () => {
  test("continues a full batch through scheduled mutations until all overdue rows are closed", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "deadline_owner" });
    const ids = await t.run(async (ctx) => {
      const result = [];
      for (const status of ["open", "paused"] as const) {
        for (let i = 0; i < 51; i++) {
          const id = await ctx.db.insert("opportunities", {
            ...opportunityArgs(owner.campaignId, { deadline: Date.now() - 1 }),
            companyId: owner.membership.companyId,
            createdBy: owner.membership._id,
            numFilledSlots: 0,
            status,
          });
          result.push(id);
        }
      }
      return result;
    });

    expect(await t.mutation(internal.opportunities.closeExpired, {})).toBeNull();
    const firstPass = await t.run(async (ctx) =>
      Promise.all(ids.map(async (id) => await ctx.db.get("opportunities", id))),
    );
    expect(firstPass.filter((opportunity) => opportunity?.status === "closed")).toHaveLength(100);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const finalPass = await t.run(async (ctx) =>
      Promise.all(ids.map(async (id) => await ctx.db.get("opportunities", id))),
    );
    expect(finalPass.every((opportunity) => opportunity?.status === "closed")).toBe(true);
    const jobs = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").take(5),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].state.kind).toBe("success");
  });

  test("does not schedule continuation when no opportunities are overdue", async () => {
    const t = convexTest(schema, modules);
    await seedOpportunity(t, { subject: "deadline_owner" });
    expect(await t.mutation(internal.opportunities.closeExpired, {})).toBeNull();
    expect(
      await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").take(1)),
    ).toEqual([]);
  });

  test("deadline closure removes an opportunity from creator get and discovery", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "deadline_owner" });
    const asCreator = await seedUser(t, { subject: "deadline_creator" });
    vi.advanceTimersByTime(86_400_000);
    await t.mutation(internal.opportunities.closeExpired, {});
    await expectApiError(
      () => asCreator.query(api.opportunities.get, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    const feed = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page).toEqual([]);
    expect(feed.isDone).toBe(true);
  });
});

describe("opportunities.pause", () => {
  test("lets a company member pause a brief and hides it from creator get and discovery", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "pause_member", role: "member" });
    const asCreator = await seedUser(t, { subject: "pause_creator" });
    const before = await owner.asCompany.query(api.opportunities.get, {
      opportunityId: owner.opportunityId,
    });
    expect(
      await asCreator.query(api.opportunities.get, { opportunityId: owner.opportunityId }),
    ).toMatchObject({ _id: owner.opportunityId, companyName: "Acme" });

    const result = await owner.asCompany.mutation(api.opportunities.pause, {
      opportunityId: owner.opportunityId,
    });

    expect(result).toEqual({ ...before, status: "paused" });
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
    await expectApiError(
      () => asCreator.query(api.opportunities.get, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    const feed = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page).toEqual([]);
    expect(feed.isDone).toBe(true);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "pause_owner" });
    await expectApiError(
      () => t.mutation(api.opportunities.pause, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "pause_owner" });
    const asCreator = await seedUser(t, { subject: "pause_creator" });
    await expectApiError(
      () => asCreator.mutation(api.opportunities.pause, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "pause_owner" });
    const asOperator = await seedOperator(t, "pause_operator");
    await expectApiError(
      () => asOperator.mutation(api.opportunities.pause, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("conceals another company's opportunity without changing it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "pause_owner" });
    const other = await seedCampaign(t, { subject: "pause_other", orgId: "org_other" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await expectApiError(
      () =>
        other.asCompany.mutation(api.opportunities.pause, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "pause_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.pause, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });
});

describe("opportunities.resume", () => {
  test("lets a company admin resume a brief and restores creator get and discovery visibility", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "resume_admin", role: "admin" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "paused" }),
    );
    const asCreator = await seedUser(t, { subject: "resume_creator" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    const result = await owner.asCompany.mutation(api.opportunities.resume, {
      opportunityId: owner.opportunityId,
    });

    expect(result).toEqual({ ...before, status: "open" });
    const creatorView = await asCreator.query(api.opportunities.get, {
      opportunityId: owner.opportunityId,
    });
    expect(creatorView).toMatchObject({
      _id: owner.opportunityId,
      status: "open",
      companyName: "Acme",
    });
    expect(creatorView).not.toHaveProperty("createdBy");
    const feed = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page).toEqual([creatorView]);
    expect(feed.isDone).toBe(true);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "resume_owner" });
    await expectApiError(
      () => t.mutation(api.opportunities.resume, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "resume_owner" });
    const asCreator = await seedUser(t, { subject: "resume_creator" });
    await expectApiError(
      () => asCreator.mutation(api.opportunities.resume, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "resume_owner" });
    const asOperator = await seedOperator(t, "resume_operator");
    await expectApiError(
      () => asOperator.mutation(api.opportunities.resume, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("conceals another company's paused opportunity without changing it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "resume_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", owner.opportunityId, { status: "paused" }),
    );
    const other = await seedCampaign(t, { subject: "resume_other", orgId: "org_other" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await expectApiError(
      () =>
        other.asCompany.mutation(api.opportunities.resume, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "resume_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.resume, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });
});

describe("opportunities.publish", () => {
  test("lets a company member publish a draft, making its brief visible to creators", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_member", role: "member" },
      { status: "draft" },
    );
    const asCreator = await seedUser(t, { subject: "publish_creator" });
    await expectApiError(
      () => asCreator.query(api.opportunities.get, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    const result = await owner.asCompany.mutation(api.opportunities.publish, {
      opportunityId: owner.opportunityId,
    });

    expect(result).toEqual({ ...before, status: "open" });
    const creatorView = await asCreator.query(api.opportunities.get, {
      opportunityId: owner.opportunityId,
    });
    expect(creatorView).toMatchObject({
      _id: owner.opportunityId,
      status: "open",
      companyName: "Acme",
    });
    expect(creatorView).not.toHaveProperty("createdBy");
    const feed = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(feed.page).toEqual([creatorView]);
    expect(feed.isDone).toBe(true);
  });

  test("lets a company admin publish a draft", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_admin", role: "admin" },
      { status: "draft" },
    );
    const result = await owner.asCompany.mutation(api.opportunities.publish, {
      opportunityId: owner.opportunityId,
    });
    expect(result.status).toBe("open");
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await expectApiError(
      () => t.mutation(api.opportunities.publish, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    const asCreator = await seedUser(t, { subject: "publish_creator" });
    await expectApiError(
      () => asCreator.mutation(api.opportunities.publish, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    const asOperator = await seedOperator(t, "publish_operator");
    await expectApiError(
      () => asOperator.mutation(api.opportunities.publish, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("conceals another company's draft and leaves it unchanged", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    const other = await seedCampaign(t, { subject: "publish_other", orgId: "org_other" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await expectApiError(
      () =>
        other.asCompany.mutation(api.opportunities.publish, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_owner", orgId: "org_other" },
      { status: "draft" },
    );
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.publish, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects a deactivated company member", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    await t.run(async (ctx) => await deactivateUser(ctx, "publish_owner"));
    await expectApiError(
      () =>
        owner.asCompany.mutation(api.opportunities.publish, { opportunityId: owner.opportunityId }),
      "account_deactivated",
    );
  });

  test("rejects fields that try to edit the draft while publishing", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "publish_owner" }, { status: "draft" });
    const args = { opportunityId: owner.opportunityId, deadline: Date.now() + 172_800_000 };
    await expect(owner.asCompany.mutation(api.opportunities.publish, args)).rejects.toThrow(
      "Unexpected field `deadline`",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toMatchObject({ status: "draft" });
  });
});

describe("opportunities.remove", () => {
  test("lets a company member remove an unused draft and returns null", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "remove_member", role: "member" },
      { status: "draft" },
    );
    expect(
      await owner.asCompany.mutation(api.opportunities.remove, {
        opportunityId: owner.opportunityId,
      }),
    ).toBeNull();
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toBeNull();
  });

  test("lets a company admin remove an unused draft", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "remove_admin", role: "admin" },
      { status: "draft" },
    );
    await owner.asCompany.mutation(api.opportunities.remove, {
      opportunityId: owner.opportunityId,
    });
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toBeNull();
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await expectApiError(
      () => t.mutation(api.opportunities.remove, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    const asCreator = await seedUser(t, { subject: "remove_creator" });
    await expectApiError(
      () => asCreator.mutation(api.opportunities.remove, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    const asOperator = await seedOperator(t, "remove_operator");
    await expectApiError(
      () => asOperator.mutation(api.opportunities.remove, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("conceals another company's draft and leaves it unchanged", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    const other = await seedCampaign(t, { subject: "remove_other", orgId: "org_other" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );
    await expectApiError(
      () =>
        other.asCompany.mutation(api.opportunities.remove, { opportunityId: owner.opportunityId }),
      "not_found",
    );
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "remove_owner", orgId: "org_other" },
      { status: "draft" },
    );
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.remove, { opportunityId: owner.opportunityId }),
      "forbidden",
    );
  });

  test("rejects a deactivated company member", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_owner" }, { status: "draft" });
    await t.run(async (ctx) => await deactivateUser(ctx, "remove_owner"));
    await expectApiError(
      () =>
        owner.asCompany.mutation(api.opportunities.remove, { opportunityId: owner.opportunityId }),
      "account_deactivated",
    );
  });
});

describe("opportunities.update", () => {
  test("lets a company member update a brief and preserves omitted fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "update_member", role: "member" },
      { productAccessLink: "https://example.com/product" },
    );
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    const result = await owner.asCompany.mutation(api.opportunities.update, {
      opportunityId: owner.opportunityId,
      title: "  Evening routine  ",
    });

    expect(result).toEqual({ ...before, title: "Evening routine" });
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
  });

  test("lets a company admin remove an optional product link", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "update_admin", role: "admin" },
      { productAccessLink: "https://example.com/product" },
    );

    const result = await owner.asCompany.mutation(api.opportunities.update, {
      opportunityId: owner.opportunityId,
      productAccessLink: null,
    });

    expect(result).not.toHaveProperty("productAccessLink");
    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(result);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    await expectApiError(
      () =>
        t.mutation(api.opportunities.update, {
          opportunityId: owner.opportunityId,
          title: "New title",
        }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const asCreator = await seedUser(t, { subject: "update_creator" });
    await expectApiError(
      () =>
        asCreator.mutation(api.opportunities.update, {
          opportunityId: owner.opportunityId,
          title: "New title",
        }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const asOperator = await seedOperator(t, "update_operator");
    await expectApiError(
      () =>
        asOperator.mutation(api.opportunities.update, {
          opportunityId: owner.opportunityId,
          title: "New title",
        }),
      "forbidden",
    );
  });

  test("conceals another company's opportunity and leaves it unchanged", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const other = await seedCampaign(t, { subject: "update_other", orgId: "org_other" });
    const before = await t.run(
      async (ctx) => await ctx.db.get("opportunities", owner.opportunityId),
    );

    await expectApiError(
      () =>
        other.asCompany.mutation(api.opportunities.update, {
          opportunityId: owner.opportunityId,
          title: "New title",
        }),
      "not_found",
    );

    expect(
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ).toEqual(before);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () =>
        asWrongOrg.mutation(api.opportunities.update, {
          opportunityId: owner.opportunityId,
          title: "New title",
        }),
      "forbidden",
    );
  });

  test("rejects direct status changes", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const args = { opportunityId: owner.opportunityId, status: "closed" };
    await expect(owner.asCompany.mutation(api.opportunities.update, args)).rejects.toThrow(
      "Unexpected field `status`",
    );
  });

  test("rejects campaign reassignment", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "update_owner" });
    const args = { opportunityId: owner.opportunityId, campaignId: owner.campaignId };
    await expect(owner.asCompany.mutation(api.opportunities.update, args)).rejects.toThrow(
      "Unexpected field `campaignId`",
    );
  });
});

describe("opportunities.discover", () => {
  test("returns public briefs with company names to a creator", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "discover_owner" },
      {
        isGated: true,
        productAccessLink: "https://example.com/private-product",
      },
    );
    await t.run(
      async (ctx) =>
        await ctx.db.patch("companies", owner.membership.companyId, { name: "Discovery Brand" }),
    );
    const asCreator = await seedUser(t, { subject: "discover_creator" });

    const result = await asCreator.query(api.opportunities.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toMatchObject([
      { _id: owner.opportunityId, companyName: "Discovery Brand", isGated: true },
    ]);
    expect(Object.keys(result.page[0]).sort()).toEqual(
      [
        "_id",
        "_creationTime",
        "companyName",
        "title",
        "description",
        "isGated",
        "usesAiReviewDefault",
        "targetApplicant",
        "maxSlots",
        "numFilledSlots",
        "maxApplications",
        "deadline",
        "status",
        "fixedFeeCents",
        "cpmRateCents",
        "paymentCapCents",
        "contentRequirements",
        "prohibitedClaims",
        "disclosureRequirements",
        "usageRights",
      ].sort(),
    );
    expect(result.isDone).toBe(true);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(
      () =>
        t.query(api.opportunities.discover, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "not_authenticated",
    );
  });

  test("rejects a company caller", async () => {
    const t = convexTest(schema, modules);
    const { asCompany } = await seedCampaign(t, { subject: "discover_company" });
    await expectApiError(
      () =>
        asCompany.query(api.opportunities.discover, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "discover_operator");
    await expectApiError(
      () =>
        asOperator.query(api.opportunities.discover, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "forbidden",
    );
  });

  test("rejects an unsynced creator", async () => {
    const t = convexTest(schema, modules);
    const asUnsynced = t.withIdentity(workosIdentity({ subject: "discover_unsynced" }));
    await expectApiError(
      () =>
        asUnsynced.query(api.opportunities.discover, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "not_synced",
    );
  });

  test("rejects an inactive creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "discover_inactive_creator" });
    await t.run(async (ctx) => await deactivateUser(ctx, "discover_inactive_creator"));
    await expectApiError(
      () =>
        asCreator.query(api.opportunities.discover, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "account_deactivated",
    );
  });
});

describe("opportunities.list", () => {
  test("allows a company member to list their company's stored opportunities", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner", role: "member" });
    await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });

    const result = await owner.asCompany.query(api.opportunities.list, {
      campaignId: owner.campaignId,
      status: "open",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ]);
    expect(result.isDone).toBe(true);
  });

  test("allows a company admin to list drafts without filters", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "list_admin", role: "admin" },
      { status: "draft" },
    );

    const result = await owner.asCompany.query(api.opportunities.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toEqual([
      await t.run(async (ctx) => await ctx.db.get("opportunities", owner.opportunityId)),
    ]);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(
      () =>
        t.query(api.opportunities.list, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "list_creator" });
    await expectApiError(
      () =>
        asCreator.query(api.opportunities.list, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "list_operator");
    await expectApiError(
      () =>
        asOperator.query(api.opportunities.list, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "forbidden",
    );
  });

  test("rejects a company caller claiming an organization they do not belong to", async () => {
    const t = convexTest(schema, modules);
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () =>
        asWrongOrg.query(api.opportunities.list, {
          paginationOpts: { numItems: 10, cursor: null },
        }),
      "forbidden",
    );
  });

  test("rejects an invalid status", async () => {
    const t = convexTest(schema, modules);
    const { asCompany } = await seedCampaign(t, { subject: "list_owner" });
    await expect(
      asCompany.query(api.opportunities.list, {
        // @ts-expect-error Exercise the public argument validator.
        status: "archived",
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow(
      'Validator error: Expected one of literal, literal, literal, literal, got `"archived"`',
    );
  });

  test("rejects a client-supplied company scope", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, membership } = await seedCampaign(t, { subject: "list_owner" });
    await expect(
      asCompany.query(api.opportunities.list, {
        // @ts-expect-error Company scope must come from the authenticated membership.
        companyId: membership.companyId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("Unexpected field `companyId`");
  });
});

describe("opportunities.create", () => {
  test("rejects an inactive company through the shared membership guard", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_inactive" });
    await t.run(
      async (ctx) => await ctx.db.patch("companies", membership.companyId, { isActive: false }),
    );

    await expectApiError(
      () => asCompany.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("allows a company admin to save a draft", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId } = await seedCampaign(t, {
      subject: "op_admin",
      role: "admin",
      status: "draft",
    });

    const id = await asCompany.mutation(
      api.opportunities.create,
      opportunityArgs(campaignId, { status: "draft" }),
    );
    expect(await t.run(async (ctx) => await ctx.db.get("opportunities", id))).toMatchObject({
      status: "draft",
      numFilledSlots: 0,
    });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });

    await expectApiError(
      () => t.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "not_authenticated",
    );
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const asCreator = await seedUser(t, { subject: "op_creator" });

    await expectApiError(
      () => asCreator.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const asOperator = await seedOperator(t, "op_operator");

    await expectApiError(
      () => asOperator.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
  });

  test("rejects creating in another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const asOther = await seedUser(t, { subject: "op_other", org: { id: "org_other" } });

    await expectApiError(
      () => asOther.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "not_found",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedCampaign(t, { subject: "op_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.mutation(api.opportunities.create, opportunityArgs(campaignId)),
      "forbidden",
    );
  });

  test("rejects a caller-supplied companyId", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = { ...opportunityArgs(campaignId), companyId: membership.companyId };

    await expect(asCompany.mutation(api.opportunities.create, args)).rejects.toThrow(
      "Unexpected field `companyId`",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("opportunities").take(1))).toEqual([]);
  });

  test("rejects caller-supplied attribution", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_owner" });
    const args = { ...opportunityArgs(campaignId), createdBy: membership._id };

    await expect(asCompany.mutation(api.opportunities.create, args)).rejects.toThrow(
      "Unexpected field `createdBy`",
    );
  });

  test("rejects caller-supplied filled slots", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId } = await seedCampaign(t, { subject: "op_owner" });
    const args = { ...opportunityArgs(campaignId), numFilledSlots: 5 };

    await expect(asCompany.mutation(api.opportunities.create, args)).rejects.toThrow(
      "Unexpected field `numFilledSlots`",
    );
  });

  test("derives ownership and attribution for a company member", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, campaignId, membership } = await seedCampaign(t, { subject: "op_member" });
    const args = opportunityArgs(campaignId);

    const id = await asCompany.mutation(api.opportunities.create, args);
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", id));

    expect(stored).toMatchObject({
      ...args,
      companyId: membership.companyId,
      createdBy: membership._id,
      numFilledSlots: 0,
    });
  });
});

describe("opportunities.get", () => {
  test("allows a creator to view a gated open opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" }, { isGated: true });
    const asCreator = await seedUser(t, { subject: "op_creator" });

    expect(await asCreator.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      isGated: true,
    });
  });

  test("allows the owner to read its own draft", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { status: "draft" },
    );

    expect(await asCompany.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      status: "draft",
    });
  });

  test("allows another member of the same company to read a draft", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { status: "draft" },
    );
    const asColleague = await seedUser(t, { subject: "op_colleague", org: { id: "org_acme" } });

    expect(await asColleague.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      status: "draft",
    });
  });

  test("allows an operator to inspect a closed opportunity", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", opportunityId, { status: "closed" }),
    );
    const asOperator = await seedOperator(t, "op_operator");

    expect(await asOperator.query(api.opportunities.get, { opportunityId })).toMatchObject({
      _id: opportunityId,
      status: "closed",
    });
  });

  test("hides even open opportunities from another company", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asOther = await seedUser(t, { subject: "op_other", org: { id: "org_other" } });

    await expectApiError(
      () => asOther.query(api.opportunities.get, { opportunityId }),
      "not_found",
    );
  });

  test("rejects a forged organization claim on reads", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner", orgId: "org_other" });
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.query(api.opportunities.get, { opportunityId }),
      "forbidden",
    );
  });

  test("rejects a company token without an organization", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asNoOrg = t.withIdentity(workosIdentity({ subject: "op_owner" }));

    await expectApiError(
      () => asNoOrg.query(api.opportunities.get, { opportunityId }),
      "misconfigured",
    );
  });

  test("hides drafts from a creator through the route", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { status: "draft" },
    );
    const asCreator = await seedUser(t, { subject: "op_creator" });

    await expectApiError(
      () => asCreator.query(api.opportunities.get, { opportunityId }),
      "not_found",
    );
  });

  test("rejects a signed-out reader", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });

    await expectApiError(
      () => t.query(api.opportunities.get, { opportunityId }),
      "not_authenticated",
    );
  });

  test("rejects an unsynced reader", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t, { subject: "op_owner" });
    const asUnsynced = t.withIdentity(workosIdentity({ subject: "op_missing" }));

    await expectApiError(
      () => asUnsynced.query(api.opportunities.get, { opportunityId }),
      "not_synced",
    );
  });

  test("rejects a deactivated reader", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId, membership } = await seedOpportunity(t, {
      subject: "op_owner",
    });
    await t.run(async (ctx) => await ctx.db.patch("users", membership.userId, { isActive: false }));

    await expectApiError(
      () => asCompany.query(api.opportunities.get, { opportunityId }),
      "account_deactivated",
    );
  });

  test("returns only the public brief and company name to a creator", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId, membership } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { productAccessLink: "https://example.com/private-product" },
    );
    await t.run(
      async (ctx) => await ctx.db.patch("companies", membership.companyId, { name: "New Brand" }),
    );
    const asCreator = await seedUser(t, { subject: "op_creator" });

    const result = await asCreator.query(api.opportunities.get, { opportunityId });
    expect(result).toMatchObject({
      _id: opportunityId,
      companyName: "New Brand",
      title: "Moisturizer launch video",
    });
    expect(Object.keys(result).sort()).toEqual(
      [
        "_id",
        "_creationTime",
        "companyName",
        "title",
        "description",
        "isGated",
        "usesAiReviewDefault",
        "targetApplicant",
        "maxSlots",
        "numFilledSlots",
        "maxApplications",
        "deadline",
        "status",
        "fixedFeeCents",
        "cpmRateCents",
        "paymentCapCents",
        "contentRequirements",
        "prohibitedClaims",
        "disclosureRequirements",
        "usageRights",
      ].sort(),
    );
  });

  test("keeps the complete document for the owning company and operators", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId } = await seedOpportunity(
      t,
      { subject: "op_owner" },
      { productAccessLink: "https://example.com/private-product" },
    );
    const asOperator = await seedOperator(t, "op_operator");
    const stored = await t.run(async (ctx) => await ctx.db.get("opportunities", opportunityId));

    expect(await asCompany.query(api.opportunities.get, { opportunityId })).toEqual(stored);
    expect(await asOperator.query(api.opportunities.get, { opportunityId })).toEqual(stored);
  });
});
