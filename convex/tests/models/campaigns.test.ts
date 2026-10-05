/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import { describe, expect, test, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { companyContext } from "../../lib/functions";
import {
  closeCampaign,
  closeExpiredCampaigns,
  createCampaign,
  listCampaigns,
  pauseCampaign,
  publishCampaign,
  removeCampaign,
  requireCampaign,
  resumeCampaign,
  updateCampaign,
} from "../../models/campaigns";
import schema from "../../schema";
import {
  expectApiError,
  seedCreatorId,
  seedOpportunity,
  seedUser,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const HOUR = 60 * 60 * 1000;
const HALF_HOUR = HOUR / 2;
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
  test.each([HOUR + 1, HOUR + 0.5])(
    "rejects an explicitly supplied off-grid end %s, including an unchanged legacy end",
    async (endsAt) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cu-end-grid");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000, endsAt: HOUR + 1 })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) =>
          updateCampaign(ctx, campaignId, owner.companyId, { title: "Do not save", endsAt }),
        ),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_end_time" } });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toStrictEqual(before);
    },
  );

  test("preserves a legacy end during unrelated edits, and allows correcting or clearing it", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-legacy-end");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000.5, endsAt: HOUR + 1 })),
    );

    for (const fields of [{ title: "Updated legacy campaign" }, {}, { endsAt: undefined }]) {
      const result = await t.run(async (ctx) =>
        updateCampaign(ctx, campaignId, owner.companyId, fields),
      );
      expect(result).toMatchObject({ startsAt: 1000.5, endsAt: HOUR + 1 });
      expect(result).toStrictEqual(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId)));
    }

    const corrected = await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, { endsAt: HOUR + HALF_HOUR }),
    );
    expect(corrected.endsAt).toBe(HOUR + HALF_HOUR);
    const cleared = await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, { endsAt: null }),
    );
    expect(cleared).not.toHaveProperty("endsAt");
    expect(cleared).toStrictEqual(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId)));
  });

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
      ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000, endsAt: HALF_HOUR })),
    );

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, {
        startsAt: HALF_HOUR + 1,
        endsAt: HOUR,
      }),
    );

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toMatchObject({
      startsAt: HALF_HOUR + 1,
      endsAt: HOUR,
    });
  });

  test("sets an end date, preserves it when omitted or undefined, and clears it with null", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cu-end");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { startsAt: 1000 })),
    );

    await t.run(async (ctx) =>
      updateCampaign(ctx, campaignId, owner.companyId, { endsAt: HALF_HOUR }),
    );
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "endsAt",
      HALF_HOUR,
    );

    for (const fields of [
      { title: "Keep the end" },
      { endsAt: undefined },
      { endsAt: HALF_HOUR },
    ]) {
      await t.run(async (ctx) => updateCampaign(ctx, campaignId, owner.companyId, fields));
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
        "endsAt",
        HALF_HOUR,
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

describe("publishCampaign", () => {
  test("rejects a future off-grid end without publishing or rounding it", async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cp-end-grid");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert(
          "campaigns",
          campaignDoc(owner, {
            status: "draft",
            startsAt: now - HOUR,
            endsAt: now + HALF_HOUR + 1,
          }),
        ),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_end_time" } });
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toStrictEqual(before);
    } finally {
      clock.mockRestore();
    }
  });

  test.each(["past", "future"] as const)(
    "publishes an empty draft with a %s start and no end, changing only status",
    async (start) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cp-owner");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert(
          "campaigns",
          campaignDoc(owner, {
            status: "draft",
            startsAt: start === "past" ? 0 : Date.now() + HOUR,
            budgetCents: 0,
            title: "  Spring launch  ",
            objective: "  Introduce the new range  ",
            product: "  Daily moisturizer  ",
            audience: "  Skincare enthusiasts  ",
            description: "\nFirst paragraph.\n\nSecond paragraph.\n",
          }),
        ),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId));

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "open",
      });
    },
  );

  test("preserves all existing opportunity statuses and details", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cp-opportunities");
    const { campaignId, opportunityIds } = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", campaignDoc(owner, { status: "draft" }));
      const opportunityIds: Id<"opportunities">[] = [];
      for (const status of ["draft", "open", "paused", "closed"] as const) {
        opportunityIds.push(
          await ctx.db.insert("opportunities", {
            ...opportunityFields,
            campaignId,
            companyId: owner.companyId,
            createdBy: owner.createdBy,
            status,
          }),
        );
      }
      return { campaignId, opportunityIds };
    });
    const before = await t.run(async (ctx) =>
      Promise.all(opportunityIds.map((id) => ctx.db.get("opportunities", id))),
    );

    await t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId));

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toHaveProperty(
      "status",
      "open",
    );
    expect(
      await t.run(async (ctx) =>
        Promise.all(opportunityIds.map((id) => ctx.db.get("opportunities", id))),
      ),
    ).toEqual(before);
  });

  test.each(["open", "paused", "closed"] as const)(
    "rejects publishing a %s campaign without changing it",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cp-status");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_not_draft" } });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test.each(["title", "objective", "product", "audience", "description"] as const)(
    "rejects a draft whose %s is blank without changing it",
    async (field) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cp-blank");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status: "draft", [field]: " \t\n " })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: `campaign_${field}_blank` },
      });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test.each([
    { fields: { budgetCents: 0.5 }, reason: "invalid_budget" },
    { fields: { startsAt: Number.NaN }, reason: "invalid_schedule" },
    { fields: { endsAt: Number.NaN }, reason: "invalid_schedule" },
    { fields: { startsAt: 2000, endsAt: 2000 }, reason: "end_not_after_start" },
    { fields: { startsAt: 0, endsAt: 1 }, reason: "campaign_expired" },
  ])("rejects an invalid stored draft with $reason", async ({ fields, reason }) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cp-invalid");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { status: "draft", ...fields })),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expect(
      t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId)),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason } });

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test.each([-1, 0, 1])("checks expiry when endsAt is now plus %i milliseconds", async (offset) => {
    const endsAt = Date.UTC(2026, 0, 1, 12);
    const now = endsAt - offset;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cp-expiry");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { status: "draft", startsAt: endsAt - HOUR, endsAt }),
        ),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      if (offset <= 0) {
        await expect(
          t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId)),
        ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_expired" } });
        expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
      } else {
        await t.run(async (ctx) => publishCampaign(ctx, campaignId, owner.companyId));
        expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
          ...before,
          status: "open",
        });
      }
    } finally {
      clock.mockRestore();
    }
  });

  test.each(["missing", "foreign"] as const)(
    "rejects a %s campaign before inspecting its status or details",
    async (kind) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cp-owner");
      const caller = await seedOwner(t, "cp-caller", "org_other");
      const campaignId = await t.run(async (ctx) => {
        const id = await ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { status: "closed", title: "" }),
        );
        if (kind === "missing") await ctx.db.delete("campaigns", id);
        return id;
      });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => publishCampaign(ctx, campaignId, caller.companyId)),
      ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );
});

describe("pauseCampaign", () => {
  test("changes only the campaign status, preserving all opportunities and agreed assignment terms", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cpause-owner");
    const creatorId = await seedCreatorId(t, "cpause-creator");
    const { campaignId, opportunityIds, assignmentId } = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", campaignDoc(owner));
      const opportunityIds: Id<"opportunities">[] = [];
      for (const status of ["draft", "open", "paused", "closed"] as const) {
        opportunityIds.push(
          await ctx.db.insert("opportunities", {
            ...opportunityFields,
            campaignId,
            companyId: owner.companyId,
            createdBy: owner.createdBy,
            status,
          }),
        );
      }
      const assignmentId = await ctx.db.insert("assignments", {
        companyId: owner.companyId,
        campaignId,
        opportunityId: opportunityIds[1],
        creatorId,
        fixedFeeCents: 1500,
        cpmRateCents: 200,
        paymentCapCents: 3000,
        usesAiReview: false,
        status: "active",
      });
      return { campaignId, opportunityIds, assignmentId };
    });
    const before = await t.run(async (ctx) => ({
      campaign: await ctx.db.get("campaigns", campaignId),
      opportunities: await Promise.all(opportunityIds.map((id) => ctx.db.get("opportunities", id))),
      assignment: await ctx.db.get("assignments", assignmentId),
    }));

    await t.run(async (ctx) => pauseCampaign(ctx, campaignId, owner.companyId));

    expect(
      await t.run(async (ctx) => ({
        campaign: await ctx.db.get("campaigns", campaignId),
        opportunities: await Promise.all(
          opportunityIds.map((id) => ctx.db.get("opportunities", id)),
        ),
        assignment: await ctx.db.get("assignments", assignmentId),
      })),
    ).toEqual({ ...before, campaign: { ...before.campaign, status: "paused" } });
  });

  test("allows pausing an open campaign without revalidating legacy details", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cpause-legacy");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert(
        "campaigns",
        campaignDoc(owner, { title: "", budgetCents: -1, startsAt: 2000, endsAt: 1000 }),
      ),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await t.run(async (ctx) => pauseCampaign(ctx, campaignId, owner.companyId));

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
      ...before,
      status: "paused",
    });
  });

  test.each(["draft", "paused", "closed"] as const)(
    "rejects pausing a %s campaign without changing it",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cpause-status");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => pauseCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_not_open" } });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test.each(["missing", "foreign"] as const)(
    "rejects a %s campaign before inspecting its status",
    async (kind) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cpause-owner");
      const caller = await seedOwner(t, "cpause-caller", "org_other");
      const campaignId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("campaigns", campaignDoc(owner, { status: "closed" }));
        if (kind === "missing") await ctx.db.delete("campaigns", id);
        return id;
      });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => pauseCampaign(ctx, campaignId, caller.companyId)),
      ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );
});

describe("resumeCampaign", () => {
  test("rejects a future off-grid end without resuming or rounding it", async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cre-end-grid");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert(
          "campaigns",
          campaignDoc(owner, {
            status: "paused",
            startsAt: now - HOUR,
            endsAt: now + HALF_HOUR + 1,
          }),
        ),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_end_time" } });
      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toStrictEqual(before);
    } finally {
      clock.mockRestore();
    }
  });

  test.each(["past", "future"] as const)(
    "resumes a paused campaign with a %s start and no end, changing only status",
    async (start) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cres-owner");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert(
          "campaigns",
          campaignDoc(owner, {
            status: "paused",
            startsAt: start === "past" ? 0 : Date.now() + HOUR,
            title: "  Original title  ",
            description: "\nOriginal paragraph.\n\nAnother paragraph.\n",
          }),
        ),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId));

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "open",
      });
    },
  );

  test("preserves every opportunity status and the existing assignment", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cres-children");
    const creatorId = await seedCreatorId(t, "cres-creator");
    const { campaignId, opportunityIds, assignmentId } = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", campaignDoc(owner, { status: "paused" }));
      const opportunityIds: Id<"opportunities">[] = [];
      for (const status of ["draft", "open", "paused", "closed"] as const) {
        opportunityIds.push(
          await ctx.db.insert("opportunities", {
            ...opportunityFields,
            campaignId,
            companyId: owner.companyId,
            createdBy: owner.createdBy,
            status,
          }),
        );
      }
      const assignmentId = await ctx.db.insert("assignments", {
        companyId: owner.companyId,
        campaignId,
        opportunityId: opportunityIds[1],
        creatorId,
        fixedFeeCents: 1500,
        cpmRateCents: 200,
        paymentCapCents: 3000,
        usesAiReview: false,
        status: "active",
      });
      return { campaignId, opportunityIds, assignmentId };
    });
    const before = await t.run(async (ctx) => ({
      campaign: await ctx.db.get("campaigns", campaignId),
      opportunities: await Promise.all(opportunityIds.map((id) => ctx.db.get("opportunities", id))),
      assignment: await ctx.db.get("assignments", assignmentId),
    }));

    await t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId));

    expect(
      await t.run(async (ctx) => ({
        campaign: await ctx.db.get("campaigns", campaignId),
        opportunities: await Promise.all(
          opportunityIds.map((id) => ctx.db.get("opportunities", id)),
        ),
        assignment: await ctx.db.get("assignments", assignmentId),
      })),
    ).toEqual({ ...before, campaign: { ...before.campaign, status: "open" } });
  });

  test.each(["draft", "open", "closed"] as const)(
    "rejects resuming a %s campaign without changing it",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cres-status");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId)),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_not_paused" } });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );

  test.each([
    { fields: { title: " \t\n " }, reason: "campaign_title_blank" },
    { fields: { budgetCents: 0.5 }, reason: "invalid_budget" },
    { fields: { startsAt: 2000, endsAt: 1000 }, reason: "end_not_after_start" },
  ])("rejects invalid paused campaign details with $reason", async ({ fields, reason }) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cres-invalid");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { status: "paused", ...fields })),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expect(
      t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId)),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason } });

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
  });

  test.each([-1, 0, 1])("checks expiry when endsAt is now plus %i milliseconds", async (offset) => {
    const endsAt = Date.UTC(2026, 0, 1, 12);
    const now = endsAt - offset;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cres-expiry");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { status: "paused", startsAt: endsAt - HOUR, endsAt }),
        ),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      if (offset <= 0) {
        await expect(
          t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId)),
        ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_expired" } });
        expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
      } else {
        await t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId));
        expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
          ...before,
          status: "open",
        });
      }
    } finally {
      clock.mockRestore();
    }
  });

  test("can resume after the company extends an expired end date", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cres-extended");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert("campaigns", campaignDoc(owner, { status: "paused", startsAt: 0, endsAt: 1 })),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await expect(
      t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId)),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "campaign_expired" } });
    const endsAt = Math.ceil((Date.now() + HOUR) / HALF_HOUR) * HALF_HOUR;
    await t.run(async (ctx) => updateCampaign(ctx, campaignId, owner.companyId, { endsAt }));
    await t.run(async (ctx) => resumeCampaign(ctx, campaignId, owner.companyId));

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
      ...before,
      endsAt,
      status: "open",
    });
  });

  test.each(["missing", "foreign"] as const)(
    "rejects a %s campaign before inspecting its status or details",
    async (kind) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cres-owner");
      const caller = await seedOwner(t, "cres-caller", "org_other");
      const campaignId = await t.run(async (ctx) => {
        const id = await ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { status: "closed", title: "" }),
        );
        if (kind === "missing") await ctx.db.delete("campaigns", id);
        return id;
      });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => resumeCampaign(ctx, campaignId, caller.companyId)),
      ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );
});

describe("closeCampaign", () => {
  test.each(["draft", "open", "paused"] as const)(
    "closes a %s campaign without changing its details or ownership",
    async (status) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cclose-owner");
      const campaignId = await t.run(async (ctx) =>
        ctx.db.insert("campaigns", campaignDoc(owner, { status, title: "  Original title  " })),
      );
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await t.run(async (ctx) => closeCampaign(ctx, campaignId, owner.companyId));

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
        ...before,
        status: "closed",
      });
    },
  );

  test("preserves all opportunity statuses and the active assignment", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cclose-children");
    const creatorId = await seedCreatorId(t, "cclose-creator");
    const { campaignId, opportunityIds, assignmentId } = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", campaignDoc(owner));
      const opportunityIds: Id<"opportunities">[] = [];
      for (const status of ["draft", "open", "paused", "closed"] as const) {
        opportunityIds.push(
          await ctx.db.insert("opportunities", {
            ...opportunityFields,
            campaignId,
            companyId: owner.companyId,
            createdBy: owner.createdBy,
            status,
          }),
        );
      }
      const assignmentId = await ctx.db.insert("assignments", {
        companyId: owner.companyId,
        campaignId,
        opportunityId: opportunityIds[1],
        creatorId,
        fixedFeeCents: 1500,
        cpmRateCents: 200,
        paymentCapCents: 3000,
        usesAiReview: false,
        status: "active",
      });
      return { campaignId, opportunityIds, assignmentId };
    });
    const before = await t.run(async (ctx) => ({
      campaign: await ctx.db.get("campaigns", campaignId),
      opportunities: await Promise.all(opportunityIds.map((id) => ctx.db.get("opportunities", id))),
      assignment: await ctx.db.get("assignments", assignmentId),
    }));

    await t.run(async (ctx) => closeCampaign(ctx, campaignId, owner.companyId));

    expect(
      await t.run(async (ctx) => ({
        campaign: await ctx.db.get("campaigns", campaignId),
        opportunities: await Promise.all(
          opportunityIds.map((id) => ctx.db.get("opportunities", id)),
        ),
        assignment: await ctx.db.get("assignments", assignmentId),
      })),
    ).toEqual({ ...before, campaign: { ...before.campaign, status: "closed" } });
  });

  test("closing an already closed campaign succeeds without further changes", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cclose-repeat");
    const campaignId = await t.run(async (ctx) => ctx.db.insert("campaigns", campaignDoc(owner)));
    await t.run(async (ctx) => closeCampaign(ctx, campaignId, owner.companyId));
    const closed = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await t.run(async (ctx) => closeCampaign(ctx, campaignId, owner.companyId));

    expect(closed?.status).toBe("closed");
    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(closed);
  });

  test("can close an expired campaign with invalid legacy details", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "cclose-legacy");
    const campaignId = await t.run(async (ctx) =>
      ctx.db.insert(
        "campaigns",
        campaignDoc(owner, { title: "", budgetCents: -1, startsAt: 2000, endsAt: 1000 }),
      ),
    );
    const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

    await t.run(async (ctx) => closeCampaign(ctx, campaignId, owner.companyId));

    expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual({
      ...before,
      status: "closed",
    });
  });

  test.each(["missing", "foreign-open", "foreign-closed"] as const)(
    "rejects a %s campaign before deciding whether it is already closed",
    async (kind) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "cclose-owner");
      const caller = await seedOwner(t, "cclose-caller", "org_other");
      const campaignId = await t.run(async (ctx) => {
        const id = await ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { status: kind === "foreign-open" ? "open" : "closed" }),
        );
        if (kind === "missing") await ctx.db.delete("campaigns", id);
        return id;
      });
      const before = await t.run(async (ctx) => ctx.db.get("campaigns", campaignId));

      await expect(
        t.run(async (ctx) => closeCampaign(ctx, campaignId, caller.companyId)),
      ).rejects.toHaveProperty("data", { code: "not_found", message: "Not found", campaignId });

      expect(await t.run(async (ctx) => ctx.db.get("campaigns", campaignId))).toEqual(before);
    },
  );
});

describe("closeExpiredCampaigns", () => {
  test("returns false when there are no campaigns, including repeated runs", async () => {
    const t = convexTest(schema, modules);

    expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(false);
    expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(false);
  });

  test("closes only due open and paused campaigns across companies, including the exact cutoff", async () => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = convexTest(schema, modules);
      const owners = [await seedOwner(t, "ce-owner"), await seedOwner(t, "ce-other", "org_other")];
      const campaignIds = await t.run(async (ctx) => {
        const ids: Id<"campaigns">[] = [];
        for (const owner of owners) {
          for (const status of ["draft", "open", "paused", "closed"] as const) {
            for (const endsAt of [now - 1, now, now + 1, undefined]) {
              ids.push(
                await ctx.db.insert(
                  "campaigns",
                  campaignDoc(owner, { status, startsAt: now - HOUR, endsAt }),
                ),
              );
            }
          }
        }
        return ids;
      });
      const before = await t.run(async (ctx) =>
        Promise.all(campaignIds.map((id) => ctx.db.get("campaigns", id))),
      );

      expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(false);

      const after = await t.run(async (ctx) =>
        Promise.all(campaignIds.map((id) => ctx.db.get("campaigns", id))),
      );
      expect(after).toEqual(
        before.map((campaign) =>
          campaign !== null &&
          (campaign.status === "open" || campaign.status === "paused") &&
          campaign.endsAt !== undefined &&
          campaign.endsAt <= now
            ? { ...campaign, status: "closed" }
            : campaign,
        ),
      );
      expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  test.each([
    [53, 52],
    [50, 1],
    [1, 50],
  ])(
    "bounds batches with %i open and %i paused due campaigns without no-end rows starving them",
    async (openCount, pausedCount) => {
      const now = 1_800_000_000_000;
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      try {
        const t = convexTest(schema, modules);
        const owner = await seedOwner(t, "ce-batch");
        const { due, noEndIds } = await t.run(async (ctx) => {
          const due: { id: Id<"campaigns">; status: "open" | "paused" }[] = [];
          const noEndIds: Id<"campaigns">[] = [];
          for (const status of ["open", "paused"] as const) {
            for (let i = 0; i < 51; i++) {
              noEndIds.push(await ctx.db.insert("campaigns", campaignDoc(owner, { status })));
            }
            const count = status === "open" ? openCount : pausedCount;
            for (let i = 0; i < count; i++) {
              const id = await ctx.db.insert(
                "campaigns",
                campaignDoc(owner, { status, startsAt: now - HOUR, endsAt: now - count + i }),
              );
              due.push({ id, status });
            }
          }
          return { due, noEndIds };
        });
        const noEndBefore = await t.run(async (ctx) =>
          Promise.all(noEndIds.map((id) => ctx.db.get("campaigns", id))),
        );

        expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(true);

        const firstBatch = await t.run(async (ctx) =>
          Promise.all(due.map(({ id }) => ctx.db.get("campaigns", id))),
        );
        for (const status of ["open", "paused"] as const) {
          const count = status === "open" ? openCount : pausedCount;
          const closed = firstBatch.filter(
            (campaign, index) => due[index].status === status && campaign?.status === "closed",
          );
          expect(closed).toHaveLength(Math.min(count, 50));
        }

        expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(false);
        expect(
          await t.run(async (ctx) =>
            Promise.all(due.map(async ({ id }) => (await ctx.db.get("campaigns", id))?.status)),
          ),
        ).toEqual(due.map(() => "closed"));
        expect(
          await t.run(async (ctx) =>
            Promise.all(noEndIds.map((id) => ctx.db.get("campaigns", id))),
          ),
        ).toEqual(noEndBefore);
      } finally {
        clock.mockRestore();
      }
    },
  );

  test("preserves all opportunities and the active assignment when a campaign expires", async () => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ce-children");
      const creatorId = await seedCreatorId(t, "ce-creator");
      const { campaignId, opportunityIds, assignmentId } = await t.run(async (ctx) => {
        const campaignId = await ctx.db.insert(
          "campaigns",
          campaignDoc(owner, { startsAt: now - HOUR, endsAt: now }),
        );
        const opportunityIds: Id<"opportunities">[] = [];
        for (const status of ["draft", "open", "paused", "closed"] as const) {
          opportunityIds.push(
            await ctx.db.insert("opportunities", {
              ...opportunityFields,
              campaignId,
              companyId: owner.companyId,
              createdBy: owner.createdBy,
              status,
            }),
          );
        }
        const assignmentId = await ctx.db.insert("assignments", {
          companyId: owner.companyId,
          campaignId,
          opportunityId: opportunityIds[1],
          creatorId,
          fixedFeeCents: 1500,
          cpmRateCents: 200,
          paymentCapCents: 3000,
          usesAiReview: false,
          status: "active",
        });
        return { campaignId, opportunityIds, assignmentId };
      });
      const before = await t.run(async (ctx) => ({
        campaign: await ctx.db.get("campaigns", campaignId),
        opportunities: await Promise.all(
          opportunityIds.map((id) => ctx.db.get("opportunities", id)),
        ),
        assignment: await ctx.db.get("assignments", assignmentId),
      }));

      expect(await t.run(async (ctx) => closeExpiredCampaigns(ctx))).toBe(false);

      expect(
        await t.run(async (ctx) => ({
          campaign: await ctx.db.get("campaigns", campaignId),
          opportunities: await Promise.all(
            opportunityIds.map((id) => ctx.db.get("opportunities", id)),
          ),
          assignment: await ctx.db.get("assignments", assignmentId),
        })),
      ).toEqual({ ...before, campaign: { ...before.campaign, status: "closed" } });
    } finally {
      clock.mockRestore();
    }
  });
});

describe("removeCampaign", () => {
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
  test.each([
    HOUR + 15 * 60 * 1000,
    HOUR + 0.5,
    Math.ceil((Number.MAX_SAFE_INTEGER + 1) / HALF_HOUR) * HALF_HOUR,
  ])("rejects off-grid or unsafe end %s in both drafts and open campaigns", async (endsAt) => {
    const t = convexTest(schema, modules);
    const owner = await seedOwner(t, "ca-end-grid");

    for (const status of ["draft", "open"] as const) {
      await expect(
        t.run(async (ctx) =>
          createCampaign(ctx, campaignDoc(owner, { status, startsAt: 1000, endsAt })),
        ),
      ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_end_time" } });
    }
    expect(await t.run(async (ctx) => ctx.db.query("campaigns").first())).toBeNull();
  });

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

  test.each([HOUR, HOUR + HALF_HOUR])(
    "accepts aligned end %s one millisecond after an unrestricted start",
    async (endsAt) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ca2");
      const startsAt = endsAt - 1;
      const doc = campaignDoc(owner, { startsAt, endsAt });

      const id = await t.run(async (ctx) => await createCampaign(ctx, doc));
      const stored = await t.run(async (ctx) => await ctx.db.get("campaigns", id));

      expect(stored).toMatchObject({ startsAt, endsAt });
    },
  );

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
    { schedule: { startsAt: Number.NaN }, reason: "invalid_schedule" },
    { schedule: { startsAt: Number.POSITIVE_INFINITY }, reason: "invalid_schedule" },
    { schedule: { endsAt: Number.NaN }, reason: "invalid_schedule" },
    { schedule: { endsAt: Number.NEGATIVE_INFINITY }, reason: "invalid_schedule" },
    { schedule: { startsAt: 2, endsAt: 1 }, reason: "end_not_after_start" },
  ])(
    "rejects invalid schedule $schedule with $reason without writing",
    async ({ schedule, reason }) => {
      const t = convexTest(schema, modules);
      const owner = await seedOwner(t, "ca6");
      const doc = campaignDoc(owner, schedule);

      await expect(t.run(async (ctx) => createCampaign(ctx, doc))).rejects.toMatchObject({
        data: { code: "invalid_state", reason },
      });

      const campaigns = await t.run(async (ctx) => await ctx.db.query("campaigns").collect());
      expect(campaigns).toHaveLength(0);
    },
  );

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
