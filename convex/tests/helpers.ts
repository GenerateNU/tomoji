import type { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import type { Infer } from "convex/values";
import { expect } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import type { ApiErrorCode } from "../lib/errors";
import { getCreatorByUserId } from "../models/creators";
import { createCampaign } from "../models/campaigns";
import { companyContext } from "../lib/functions";
import { createOpportunity, type OpportunityCreate } from "../models/opportunities";
import { applyMembership, getUserByWorkosId, upsertUser } from "../models/users";
import type { companyRole } from "../schemas/companyUsers.schema";

export type TestConvex = ReturnType<typeof convexTest>;

/** A fake WorkOS token. */
export function workosIdentity(claims: {
  subject: string;
  email?: string;
  name?: string;
  org_id?: string;
  role?: string;
}): Partial<UserIdentity> {
  return claims as Partial<UserIdentity>;
}

/** Asserts a call fails with a specific API error code. */
export async function expectApiError(call: () => Promise<unknown>, code: ApiErrorCode) {
  await expect(call()).rejects.toThrow(new RegExp(`"code":"${code}"`));
}

export type SeedOptions = {
  subject: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  org?: { id: string; name?: string; role?: Infer<typeof companyRole> };
};

/**
 * Applies the webhook handlers' effects directly, then returns a client
 * carrying the matching token.
 */
export async function seedUser(t: TestConvex, opts: SeedOptions) {
  await t.run(async (ctx) => {
    await upsertUser(ctx, {
      workosId: opts.subject,
      email: opts.email ?? `${opts.subject}@example.com`,
      firstName: opts.firstName ?? "Test",
      lastName: opts.lastName ?? "",
    });
    if (opts.org) {
      await applyMembership(ctx, {
        workosUserId: opts.subject,
        organizationId: opts.org.id,
        organizationName: opts.org.name ?? "Acme",
        role: opts.org.role ?? "member",
      });
    }
  });

  return t.withIdentity(
    workosIdentity({ subject: opts.subject, org_id: opts.org?.id, role: opts.org?.role }),
  );
}

/** Seeds a creator account and returns its creator document ID. */
export async function seedCreatorId(t: TestConvex, subject: string): Promise<Id<"creators">> {
  await seedUser(t, { subject });
  return await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    const creator = await getCreatorByUserId(ctx, user._id);
    if (creator === null) throw new Error("expected seeded creator");
    return creator._id;
  });
}

/** Seeds an operator and returns a client carrying the matching token. */
export async function seedOperator(t: TestConvex, subject: string) {
  const asOperator = await seedUser(t, { subject });
  await t.run(async (ctx) => {
    const user = await getUserByWorkosId(ctx, subject);
    if (user === null) throw new Error("expected seeded user");
    await ctx.db.patch("users", user._id, { role: "operator" });
  });
  return asOperator;
}

/**
 * Seeds a member of `org_acme` and returns a client whose token claims
 * `org_other`, an org they do not belong to.
 */
export async function seedWrongOrgCaller(t: TestConvex) {
  await seedUser(t, { subject: "outsider", org: { id: "org_acme" } });
  await seedUser(t, { subject: "insider", org: { id: "org_other", name: "Other" } });
  return t.withIdentity(workosIdentity({ subject: "outsider", org_id: "org_other" }));
}

export type SeedCampaignOptions = {
  subject: string;
  orgId?: string;
  role?: Infer<typeof companyRole>;
  status?: Doc<"campaigns">["status"];
};

/** Seeds a company caller and its campaign with server-derived ownership. */
export async function seedCampaign(t: TestConvex, options: SeedCampaignOptions) {
  const asCompany = await seedUser(t, {
    subject: options.subject,
    org: { id: options.orgId ?? "org_acme", role: options.role },
  });
  const { campaignId, membership } = await asCompany.run(async (ctx) => {
    const { membership } = await companyContext(ctx);
    const campaignId = await createCampaign(ctx, {
      companyId: membership.companyId,
      createdBy: membership._id,
      title: "Spring launch",
      objective: "Introduce the new skincare range",
      product: "Daily moisturizer",
      audience: "Skincare enthusiasts",
      description: "Campaign supporting the spring launch.",
      status: "open",
      budgetCents: 250_000,
      startsAt: Date.now(),
    });
    if (options.status !== undefined) {
      await ctx.db.patch("campaigns", campaignId, { status: options.status });
    }
    return { campaignId, membership };
  });
  return { asCompany, campaignId, membership };
}

/** A complete opportunity brief without server-owned fields. */
export function opportunityArgs(
  campaignId: Id<"campaigns">,
  overrides: Partial<OpportunityCreate> = {},
): OpportunityCreate {
  return {
    campaignId,
    title: "Moisturizer launch video",
    description: "Show the product in your daily skincare routine.",
    status: "open",
    isGated: false,
    usesAiReviewDefault: true,
    targetApplicant: "Skincare creators",
    maxSlots: 5,
    maxApplications: 5,
    deadline: Date.now() + 86_400_000,
    fixedFeeCents: 10_000,
    cpmRateCents: 500,
    paymentCapCents: 25_000,
    contentRequirements: "One 30-second video",
    prohibitedClaims: "No medical claims",
    disclosureRequirements: "Disclose the paid partnership",
    usageRights: "Organic reposting for 30 days",
    ...overrides,
  };
}

/** Seeds a campaign and an opportunity through the model, bypassing route authorization. */
export async function seedOpportunity(
  t: TestConvex,
  options: SeedCampaignOptions,
  overrides: Partial<OpportunityCreate> = {},
) {
  const owner = await seedCampaign(t, options);
  const opportunityId = await t.run(
    async (ctx) =>
      await createOpportunity(ctx, owner.membership, opportunityArgs(owner.campaignId, overrides)),
  );
  return { ...owner, opportunityId };
}
