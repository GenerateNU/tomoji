import type { convexTest } from "convex-test";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { insertCompanyCampaign } from "./models/campaigns";

export type TestConvex = ReturnType<typeof convexTest>;

export const DAY_MS = 86_400_000;

let seedCounter = 0;

/**
 * Seeds a company plus a companyUser (needed to satisfy campaigns.createdBy)
 * and returns their ids. `workosId` values are suffixed with a counter so
 * calling this twice in the same test (e.g. for a second company) produces
 * distinct values, which keeps failures readable and supports lookups by
 * `workosId`.
 */
export async function seedCompanyAndCreator(t: TestConvex) {
  const suffix = ++seedCounter;
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      workosId: `workos_company_${suffix}`,
      name: "Acme Co",
      isActive: true,
    });
    const userId = await ctx.db.insert("users", {
      workosId: `workos_user_${suffix}`,
      name: "Jane Manager",
      email: "jane@acme.example",
      role: "company",
      is_active: true,
    });
    const createdBy = await ctx.db.insert("companyUsers", {
      userId,
      companyId,
      role: "admin",
    });
    return { companyId, createdBy };
  });
}

export type CampaignOverrides = Partial<WithoutSystemFields<Doc<"campaigns">>>;

/**
 * Seeds a campaign through the real `insertCompanyCampaign` model function.
 * `now` is explicit because the model function validates `deadline` against
 * the clock, and the two callers use different clocks.
 */
export async function seedCampaign(
  t: TestConvex,
  companyId: Id<"companies">,
  createdBy: Id<"companyUsers">,
  now: number,
  overrides: CampaignOverrides = {},
): Promise<Id<"campaigns">> {
  return await t.run(async (ctx) =>
    insertCompanyCampaign(ctx, {
      companyId,
      createdBy,
      title: "Untitled campaign",
      description: "A campaign description",
      format: "video",
      status: "open",
      isVetted: false,
      maxApplications: 10,
      maxOpenings: 3,
      deadline: now + DAY_MS,
      ...overrides,
    }),
  );
}
