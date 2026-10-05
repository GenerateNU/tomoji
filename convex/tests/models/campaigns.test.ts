/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { companyContext } from "../../lib/functions";
import {
  createCampaign,
  listCampaigns,
  removeCampaign,
  requireCampaign,
  updateCampaign,
} from "../../models/campaigns";
import schema from "../../schema";
import { expectApiError, seedOpportunity, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const HOUR = 60 * 60 * 1000;

async function seedOwner(t: TestConvex, subject: string, orgId = "org_acme") {
  const as = await seedUser(t, { subject, org: { id: orgId } });
  return await as.run(async (ctx) => {
    const { membership } = await companyContext(ctx);
    return { companyId: membership.companyId, createdBy: membership._id };
  });
}

function campaignDoc(
  owner: { companyId: Id<"companies">; createdBy: Id<"companyUsers"> },
  overrides: Partial<WithoutSystemFields<Doc<"campaigns">>> = {},
): WithoutSystemFields<Doc<"campaigns">> {
  return {
    ...owner,
    title: "Spring launch",
    objective: "Introduce the new skincare range",
    product: "Daily moisturizer",
    audience: "Gen Z skincare enthusiasts",
    description: "Campaign supporting the spring launch.",
    status: "open",
    budgetCents: 250_000,
    startsAt: Date.now() + HOUR,
    ...overrides,
  };
}

describe("requireCampaign", () => {
  test.each(["draft", "open", "paused", "closed"] as const)(
    "returns an owned campaign with status %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cg-owned");
      const doc = campaignDoc(owner, { status });
      const campaignId = await t.run(async (ctx) => await ctx.db.insert("campaigns", doc));

      const campaign = await t.run(
        async (ctx) => await requireCampaign(ctx, campaignId, owner.companyId),
      );

      expect(campaign).toMatchObject({ ...doc, _id: campaignId });
      expect(campaign.endsAt).toBeUndefined();
    },
  );

  test("throws not_found for a missing campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cg-missing");
    const campaignId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("campaigns", campaignDoc(owner));
      await ctx.db.delete("campaigns", id);
      return id;
    });

    await expect(
      t.run(async (ctx) => await requireCampaign(ctx, campaignId, owner.companyId)),
    ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });
  });

  test("uses the same not_found error for another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cg-owner", "org_acme");
    const other = await seedOwner(t, "cg-other", "org_other");
    const campaignId = await t.run(
      async (ctx) => await ctx.db.insert("campaigns", campaignDoc(owner)),
    );

    await expect(
      t.run(async (ctx) => await requireCampaign(ctx, campaignId, other.companyId)),
    ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });
  });
});

describe("listCampaigns", () => {
  test("lists only the company's campaigns across all statuses, newest first", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cl-owner");
    const other = await seedOwner(t, "cl-other", "org_other");
    const campaignIds = await t.run(async (ctx) => {
      const ids: Id<"campaigns">[] = [];
      for (const status of ["open", "closed", "draft", "paused"] as const) {
        ids.push(await ctx.db.insert("campaigns", campaignDoc(owner, { status })));
        await ctx.db.insert("campaigns", campaignDoc(other, { status }));
      }
      return ids;
    });

    const result = await t.run(async (ctx) =>
      listCampaigns(ctx, owner.companyId, { paginationOpts: { cursor: null, numItems: 10 } }),
    );

    expect(result.page.map((campaign) => campaign._id)).toEqual(campaignIds.toReversed());
    expect(result.isDone).toBe(true);
  });

  test.each(["draft", "open", "paused", "closed"] as const)(
    "filters by %s within the company",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cl-filter-owner");
      const other = await seedOwner(t, "cl-filter-other", "org_other");
      const matchingIds = await t.run(async (ctx) => {
        const ids: Id<"campaigns">[] = [];
        for (const candidate of ["draft", "open", "paused", "closed"] as const) {
          const id = await ctx.db.insert("campaigns", campaignDoc(owner, { status: candidate }));
          if (candidate === status) ids.push(id);
        }
        await ctx.db.insert("campaigns", campaignDoc(other, { status }));
        return ids;
      });

      const result = await t.run(async (ctx) =>
        listCampaigns(ctx, owner.companyId, {
          status,
          paginationOpts: { cursor: null, numItems: 10 },
        }),
      );

      expect(result.page.map((campaign) => campaign._id)).toEqual(matchingIds);
      expect(result.isDone).toBe(true);
    },
  );

  test.each([undefined, "closed"] as const)(
    "returns a completed empty page when no campaigns match status %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cl-empty-owner");
      const other = await seedOwner(t, "cl-empty-other", "org_other");
      await t.run(async (ctx) => {
        await ctx.db.insert("campaigns", campaignDoc(other, { status: "closed" }));
        if (status !== undefined) await ctx.db.insert("campaigns", campaignDoc(owner));
      });

      const result = await t.run(async (ctx) =>
        listCampaigns(ctx, owner.companyId, {
          status,
          paginationOpts: { cursor: null, numItems: 2 },
        }),
      );

      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    },
  );

  test.each([undefined, "open"] as const)(
    "pages through status %s without duplicates, omissions, or another company's campaigns",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cl-page-owner");
      const other = await seedOwner(t, "cl-page-other", "org_other");
      const matchingIds = await t.run(async (ctx) => {
        const ids: Id<"campaigns">[] = [];
        for (const candidate of ["open", "draft", "open", "paused", "open"] as const) {
          const id = await ctx.db.insert("campaigns", campaignDoc(owner, { status: candidate }));
          if (status === undefined || candidate === status) ids.push(id);
          await ctx.db.insert("campaigns", campaignDoc(other, { status: candidate }));
        }
        return ids.toReversed();
      });
      const receivedIds: Id<"campaigns">[] = [];
      let cursor: string | null = null;
      let isDone = false;

      for (let page = 0; page < 3 && !isDone; page++) {
        const result = await t.run(async (ctx) =>
          listCampaigns(ctx, owner.companyId, {
            status,
            paginationOpts: { cursor, numItems: 2 },
          }),
        );
        receivedIds.push(...result.page.map((campaign) => campaign._id));
        cursor = result.continueCursor;
        isDone = result.isDone;
      }

      expect(isDone).toBe(true);
      expect(receivedIds).toEqual(matchingIds);
    },
  );

  test("preserves the optional pagination read limit and continuation cursor", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cl-limit");
    const campaignIds = await t.run(async (ctx) => {
      const ids: Id<"campaigns">[] = [];
      for (let n = 0; n < 3; n++) {
        ids.push(await ctx.db.insert("campaigns", campaignDoc(owner)));
      }
      return ids.toReversed();
    });

    const first = await t.run(async (ctx) =>
      listCampaigns(ctx, owner.companyId, {
        paginationOpts: { cursor: null, numItems: 10, maximumRowsRead: 2 },
      }),
    );
    const second = await t.run(async (ctx) =>
      listCampaigns(ctx, owner.companyId, {
        paginationOpts: { cursor: first.continueCursor, numItems: 10 },
      }),
    );

    expect(first.page.map((campaign) => campaign._id)).toEqual(campaignIds.slice(0, 2));
    expect(first.isDone).toBe(false);
    expect(second.page.map((campaign) => campaign._id)).toEqual(campaignIds.slice(2));
    expect(second.isDone).toBe(true);
  });
});

describe("updateCampaign", () => {
  test.each(["draft", "open", "paused", "closed"] as const)(
    "rejects an end before an existing %s opportunity deadline without changing either record",
    async (status) => {
      const t = convexTest(schema, modules);
      const { campaignId, opportunityId, membership } = await seedOpportunity(t, {
        subject: "cu-child-deadline",
      });
      const before = await t.run(async (ctx) => {
        await ctx.db.patch("opportunities", opportunityId, { status });
        return {
          campaign: await ctx.db.get("campaigns", campaignId),
          opportunity: await ctx.db.get("opportunities", opportunityId),
        };
      });

      await expect(
        t.run(async (ctx) =>
          updateCampaign(ctx, campaignId, membership.companyId, {
            title: "Do not save",
            endsAt: before.opportunity!.deadline - HOUR,
          }),
        ),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "end_before_opportunity_deadline" },
      });

      expect(
        await t.run(async (ctx) => ({
          campaign: await ctx.db.get("campaigns", campaignId),
          opportunity: await ctx.db.get("opportunities", opportunityId),
        })),
      ).toEqual(before);
    },
  );

  test("accepts an end equal to the latest child deadline and allows clearing it", async () => {
    const t = convexTest(schema, modules);
    const { campaignId, opportunityId, membership } = await seedOpportunity(t, {
      subject: "cu-child-end",
    });
    const opportunity = await t.run(async (ctx) => ctx.db.get("opportunities", opportunityId));
    await seedOpportunity(
      t,
      { subject: "cu-other-child", orgId: "org_other" },
      { deadline: opportunity!.deadline + HOUR },
    );
    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, membership.companyId, {
        endsAt: opportunity!.deadline + HOUR,
      }),
    );

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, membership.companyId, { endsAt: opportunity!.deadline }),
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "endsAt",
      opportunity!.deadline,
    );

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, membership.companyId, { endsAt: null }),
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).not.toHaveProperty(
      "endsAt",
    );
    expect(await t.run(async (ctx) => ctx.db.get("opportunities", opportunityId))).toEqual(
      opportunity,
    );
  });

  test.each(["draft", "open", "paused"] as const)(
    "updates a %s campaign while preserving ownership and omitted fields",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cu-owner");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      const result = await t.run(async (ctx) =>
        updateCampaign(ctx, campaignId, owner.companyId, {
          title: "  Updated title  ",
          budgetCents: 0,
          startsAt: 0,
        }),
      );

      const after = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
      expect(after).toEqual({ ...before, title: "Updated title", budgetCents: 0, startsAt: 0 });
      expect(result).toStrictEqual(after);
    },
  );

  test.each([{ title: "Changed" }, {}, { title: "", budgetCents: -1 }])(
    "rejects a closed campaign update %j without changing it",
    async (fields) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cu-closed");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status: "closed" })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => updateCampaign(ctx, campaignId, owner.companyId, fields)),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "campaign_closed" },
      });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test("trims each provided brief field while preserving internal whitespace", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-trim");
    const campaignId = await t.run(async (ctx) => ctx.db.insert("campaigns", campaignDoc(owner)));

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, {
        title: "  Updated launch  ",
        objective: "\tIntroduce the new range\n",
        product: "  Night moisturizer  ",
        audience: "  Skincare enthusiasts  ",
        description: "\nFirst paragraph.\n\nSecond paragraph.\n",
      }),
    );

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toMatchObject({
      title: "Updated launch",
      objective: "Introduce the new range",
      product: "Night moisturizer",
      audience: "Skincare enthusiasts",
      description: "First paragraph.\n\nSecond paragraph.",
    });
  });

  test.each(["title", "objective", "product", "audience", "description"] as const)(
    "rejects blank updates to %s without changing the campaign",
    async (field) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cu-blank");
      const campaignId = await t.run(async (ctx) => ctx.db.insert("campaigns", campaignDoc(owner)));
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      for (const value of ["", " \t\n "]) {
        await expect(
          t.run(async (ctx) =>
            updateCampaign(ctx, campaignId, owner.companyId, { budgetCents: 1, [field]: value }),
          ),
        ).rejects.toHaveProperty("data.reason", `campaign_${field}_blank`);
      }

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test.each([
    { budgetCents: -1 },
    { budgetCents: 0.5 },
    { budgetCents: Number.MAX_SAFE_INTEGER + 1 },
    { startsAt: Number.POSITIVE_INFINITY },
    { endsAt: Number.NaN },
    { startsAt: 2000 },
    { endsAt: 1000 },
  ])("rejects invalid numeric or partial schedule update %j atomically", async (fields) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-invalid");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000, endsAt: 2000 })),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expectApiError(
      () =>
        t.run(async (ctx) =>
          updateCampaign(ctx, campaignId, owner.companyId, { title: "Do not save", ...fields }),
        ),
      "invalid_state",
    );

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test("validates the final schedule when both dates change together", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-dates");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000, endsAt: 2000 })),
    );

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, { startsAt: 3000, endsAt: 4000 }),
    );

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toMatchObject({
      startsAt: 3000,
      endsAt: 4000,
    });
  });

  test("sets an end date, preserves it when omitted or undefined, and clears it with null", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-end");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000 })),
    );

    await t.run(async (ctx) => updateCampaign(ctx, campaignId, owner.companyId, { endsAt: 2000 }));
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "endsAt",
      2000,
    );

    for (const fields of [{ title: "Keep the end" }, { endsAt: undefined }]) {
      await t.run(async (ctx) => updateCampaign(ctx, campaignId, owner.companyId, fields));
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
        "endsAt",
        2000,
      );
    }

    const result = await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, { startsAt: 3000, endsAt: null }),
    );
    const after = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));
    expect(after).not.toHaveProperty("endsAt");
    expect(after?.startsAt).toBe(3000);
    expect(result).toStrictEqual(after);
  });

  test("does not revalidate omitted legacy brief fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-legacy");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert(
        "campaigns",
        campaignDoc(owner, {
          title: "",
          objective: "",
          product: "",
          audience: "",
          description: "",
        }),
      ),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, { budgetCents: 100 }),
    );

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
      ...before,
      budgetCents: 100,
    });
  });

  test("accepts an empty update without changing any fields", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-empty");
    const campaignId = await t.run(async (ctx) => ctx.db.insert("campaigns", campaignDoc(owner)));
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    const result = await t.run(async (ctx) => updateCampaign(ctx, campaignId, owner.companyId, {}));

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    expect(result).toStrictEqual(before);
  });

  test.each(["missing", "foreign"] as const)(
    "rejects a %s campaign before checking its status or validating fields",
    async (kind) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cu-owner");
      const caller = await seedOwner(t, "cu-caller", "org_other");
      const campaignId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("campaigns", campaignDoc(owner, { status: "closed" }));
        if (kind === "missing") await ctx.db.delete("campaigns", id);
        return id;
      });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) =>
          updateCampaign(ctx, campaignId, caller.companyId, { title: "", budgetCents: -1 }),
        ),
      ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );
});

describe("removeCampaign", () => {
  const opportunityFields = {
    title: "Product launch post",
    description: "Introduce the moisturizer to your audience.",
    isGated: false,
    usesAiReviewDefault: false,
    targetApplicant: "Skincare creators",
    maxSlots: 5,
    numFilledSlots: 0,
    maxApplications: 20,
    deadline: 2000,
    fixedFeeCents: 1000,
    cpmRateCents: 100,
    paymentCapCents: 2000,
    contentRequirements: "Share your experience with the product.",
    prohibitedClaims: "No medical claims.",
    disclosureRequirements: "Disclose the sponsorship.",
    usageRights: "Organic reposting only.",
  };

  test("removes an empty draft while preserving another campaign and its opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cr-owner");
    const { campaignId, otherCampaignId, opportunityId } = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", campaignDoc(owner, { status: "draft" }));
      const otherCampaignId = await ctx.db.insert("campaigns", campaignDoc(owner));
      const opportunityId = await ctx.db.insert("opportunities", {
        ...opportunityFields,
        campaignId: otherCampaignId,
        companyId: owner.companyId,
        createdBy: owner.createdBy,
        status: "open",
      });
      return { campaignId, otherCampaignId, opportunityId };
    });
    const before = await t.run(async (ctx) => ({
      otherCampaign: await ctx.db.get("campaigns", otherCampaignId),
      opportunity: await ctx.db.get("opportunities", opportunityId),
    }));

    await t.run(async (ctx) => removeCampaign(ctx, campaignId, owner.companyId));

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toBeNull();
    expect(
      await t.run(async (ctx) => ({
        otherCampaign: await ctx.db.get("campaigns", otherCampaignId),
        opportunity: await ctx.db.get("opportunities", opportunityId),
      })),
    ).toEqual(before);
  });

  test.each(["open", "paused", "closed"] as const)(
    "rejects removal of a %s campaign even without opportunities",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cr-status");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => removeCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_not_draft" } });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test.each(["draft", "open", "paused", "closed"] as const)(
    "rejects removal when a %s opportunity exists and preserves both records",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cr-child");
      const { campaignId, opportunityId } = await t.run(async (ctx) => {
        const campaignId = await ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { status: "draft" }),
        );
        const opportunityId = await ctx.db.insert("opportunities", {
          ...opportunityFields,
          campaignId,
          companyId: owner.companyId,
          createdBy: owner.createdBy,
          status,
        });
        return { campaignId, opportunityId };
      });
      const before = await t.run(async (ctx) => ({
        campaign: await ctx.db.get("campaigns", campaignId),
        opportunity: await ctx.db.get("opportunities", opportunityId),
      }));

      await expect(
        t.run(async (ctx) => removeCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "campaign_has_opportunities" },
      });

      expect(
        await t.run(async (ctx) => ({
          campaign: await ctx.db.get("campaigns", campaignId),
          opportunity: await ctx.db.get("opportunities", opportunityId),
        })),
      ).toEqual(before);
    },
  );

  test.each(["missing", "foreign"] as const)(
    "rejects a %s campaign before checking its state",
    async (kind) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cr-owner");
      const caller = await seedOwner(t, "cr-caller", "org_other");
      const campaignId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("campaigns", campaignDoc(owner, { status: "open" }));
        if (kind === "missing") await ctx.db.delete("campaigns", id);
        return id;
      });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => removeCampaign(ctx, campaignId, caller.companyId)),
      ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );
});

describe("createCampaign", () => {
  test.each(["title", "objective", "product", "audience", "description"] as const)(
    "rejects blank %s in drafts and open campaigns without writing",
    async (field) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ca-blank");

      for (const status of ["draft", "open"] as const) {
        for (const value of ["", " \t\n "]) {
          const doc = campaignDoc(owner, { status, [field]: value });

          await expect(t.run(async (ctx) => await createCampaign(ctx, doc))).rejects.toMatchObject({
            data: { code: "invalid_state", reason: `campaign_${field}_blank` },
          });
        }
      }
      expect(await t.run(async (ctx) => await ctx.db.query("campaigns").first())).toBeNull();
    },
  );

  test("trims brief fields while preserving internal whitespace", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca-trim");
    const doc = campaignDoc(owner, {
      title: "  Spring launch  ",
      objective: "  Introduce the new skincare range\n",
      product: "\tDaily moisturizer  ",
      audience: "  Gen Z skincare enthusiasts  ",
      description: "\nFirst paragraph.\n\nSecond paragraph.\n",
    });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored).toMatchObject({
      title: "Spring launch",
      objective: "Introduce the new skincare range",
      product: "Daily moisturizer",
      audience: "Gen Z skincare enthusiasts",
      description: "First paragraph.\n\nSecond paragraph.",
    });
  });

  test("stores the campaign brief, budget, and schedule", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca1");
    const doc = campaignDoc(owner);

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored).toMatchObject(doc);
    expect(stored?.endsAt).toBeUndefined();
  });

  test("persists an optional end time one millisecond after the start", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca2");
    const startsAt = Date.now() + HOUR;
    const doc = campaignDoc(owner, { startsAt, endsAt: startsAt + 1 });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.endsAt).toBe(doc.endsAt);
  });

  test("allows a campaign to start in the past with a zero budget", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca3");
    const doc = campaignDoc(owner, { startsAt: Date.now() - HOUR, budgetCents: 0 });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored).toMatchObject(doc);
  });

  test("rejects an end equal to the start without writing a campaign", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca4");
    const startsAt = Date.now() + HOUR;
    const doc = campaignDoc(owner, { startsAt, endsAt: startsAt });

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });

  test.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid budget %s without writing a campaign",
    async (budgetCents) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ca5");
      const doc = campaignDoc(owner, { budgetCents });

      await expectApiError(
        () => t.run(async (ctx) => await createCampaign(ctx, doc)),
        "invalid_state",
      );

      const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
      expect(campaigns).toHaveLength(0);
    },
  );

  test.each([
    { startsAt: Number.NaN },
    { startsAt: Number.POSITIVE_INFINITY },
    { endsAt: Number.NaN },
    { endsAt: Number.NEGATIVE_INFINITY },
    { startsAt: 2, endsAt: 1 },
  ])("rejects invalid schedule %j without writing a campaign", async (schedule) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca6");
    const doc = campaignDoc(owner, schedule);

    await expectApiError(
      () => t.run(async (ctx) => await createCampaign(ctx, doc)),
      "invalid_state",
    );

    const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
    expect(campaigns).toHaveLength(0);
  });

  test.each(["draft", "open"] as const)("creates a campaign with status %s", async (status) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, `ca-status-ok-${status}`);
    const doc = campaignDoc(owner, { status });

    const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
    const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

    expect(stored?.status).toBe(status);
  });

  test.each(["paused", "closed"] as const)(
    "rejects status %s without writing a campaign",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, `ca-status-bad-${status}`);
      const doc = campaignDoc(owner, { status });

      await expect(t.run(async (ctx) => await createCampaign(ctx, doc))).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "invalid_status" },
      });

      const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
      expect(campaigns).toHaveLength(0);
    },
  );
});
