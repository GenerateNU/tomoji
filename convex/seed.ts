import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { HALF_HOUR_MS } from "./lib/validation";
import { updateCreatorNiches } from "./models/creatorNiches";

/**
 * Demo data for every frontend flow, for a personal dev deployment.
 *
 * It attaches content to accounts that already exist rather than inventing
 * them, because a seeded `users` row has no WorkOS identity behind it and
 * nobody can sign in as it. Go through the invite flows first, then run this.
 *
 * Re-runnable: every run clears the tables it owns and rebuilds them. Accounts,
 * companies, and memberships are left alone, since WorkOS owns those.
 */

/** Tables this seed owns outright. Anything here is wiped on every run. */
const OWNED_TABLES = [
  "notifications",
  "disputes",
  "submissions",
  "posts",
  "assignments",
  "applications",
  "opportunityStars",
  "opportunities",
  "campaigns",
  "invites",
] as const;

const DAY = 24 * 60 * 60 * 1000;

/** The next exact :00/:30 UTC boundary, which deadlines and end dates require. */
function halfHourFromNow(days: number): number {
  return Math.ceil((Date.now() + days * DAY) / HALF_HOUR_MS) * HALF_HOUR_MS;
}

async function clearOwnedTables(ctx: MutationCtx): Promise<number> {
  let removed = 0;
  for (const table of OWNED_TABLES) {
    for await (const row of ctx.db.query(table)) {
      await ctx.db.delete(row._id);
      removed += 1;
    }
  }
  return removed;
}

/**
 * The company whose admin will own the seeded campaigns and opportunities.
 *
 * Every developer's deployment receives the same WorkOS webhooks, so several
 * companies can exist side by side. Scanning companies oldest-first keeps the
 * default stable across machines; `companyName` overrides it.
 */
async function requireSeedCompany(
  ctx: MutationCtx,
  companyName?: string,
): Promise<{ company: Doc<"companies">; admin: Doc<"companyUsers"> }> {
  const wanted = companyName?.trim().toLowerCase();
  let sawWanted = false;

  for await (const company of ctx.db
    .query("companies")
    .withIndex("by_isActive", (q) => q.eq("isActive", true))) {
    if (wanted !== undefined && company.name.trim().toLowerCase() !== wanted) continue;
    sawWanted = true;
    for await (const membership of ctx.db
      .query("companyUsers")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))) {
      if (membership.isActive && membership.role === "admin") {
        return { company, admin: membership };
      }
    }
  }
  if (wanted !== undefined && !sawWanted) {
    throw apiError("invalid_state", { reason: "company_not_found", name: wanted });
  }
  throw apiError("invalid_state", { reason: "no_company_admin" });
}

/**
 * Creators to hang applications, stars, and notifications on. The first one
 * gets the populated profile, so `creatorEmail` picks the account you can
 * actually sign in as rather than whichever row happens to come first.
 */
async function requireSeedCreators(
  ctx: MutationCtx,
  creatorEmail?: string,
): Promise<Doc<"creators">[]> {
  const creators: Doc<"creators">[] = [];
  let preferred: Doc<"creators"> | undefined;
  const wanted = creatorEmail?.trim().toLowerCase();

  for await (const user of ctx.db
    .query("users")
    .withIndex("by_role_and_isActive", (q) => q.eq("role", "creator").eq("isActive", true))) {
    const creator = await ctx.db
      .query("creators")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (creator === null) continue;
    if (wanted !== undefined && user.email === wanted) preferred = creator;
    else if (creators.length < 4) creators.push(creator);
  }

  if (wanted !== undefined && preferred === undefined) {
    throw apiError("invalid_state", { reason: "creator_not_found", email: wanted });
  }
  const ordered = preferred ? [preferred, ...creators] : creators;
  if (ordered.length === 0) throw apiError("invalid_state", { reason: "no_creators" });
  return ordered.slice(0, 4);
}

type OpportunitySpec = {
  title: string;
  description: string;
  isGated: boolean;
  maxSlots: number;
  numFilledSlots: number;
  maxApplications: number;
  deadlineInDays: number;
  status: Doc<"opportunities">["status"];
  fixedFeeCents: number;
  cpmRateCents: number;
  paymentCapCents: number;
  niches: string[];
};

/**
 * Chosen to cover what the feed renders rather than to look like a real
 * catalogue: both access types, full and open slots, every compensation
 * shape, and statuses that must stay out of discovery.
 */
const OPPORTUNITIES: OpportunitySpec[] = [
  {
    title: "Build an agent with our SDK",
    description: "A walkthrough video showing a working agent in under ten minutes.",
    isGated: true,
    maxSlots: 8,
    numFilledSlots: 2,
    maxApplications: 8,
    deadlineInDays: 21,
    status: "open",
    fixedFeeCents: 65_000,
    cpmRateCents: 500,
    paymentCapCents: 200_000,
    niches: ["ai-agents", "developer-tools"],
  },
  {
    title: "Ship a side project on our free tier",
    description: "Record yourself going from empty repo to deployed app.",
    isGated: false,
    maxSlots: 20,
    numFilledSlots: 3,
    maxApplications: 20,
    deadlineInDays: 14,
    status: "open",
    fixedFeeCents: 30_000,
    cpmRateCents: 0,
    paymentCapCents: 0,
    niches: ["web-development", "startups"],
  },
  {
    title: "Explain our vector search in one minute",
    description: "A short vertical video for the launch.",
    isGated: false,
    maxSlots: 5,
    numFilledSlots: 5,
    maxApplications: 5,
    deadlineInDays: 10,
    status: "open",
    fixedFeeCents: 0,
    cpmRateCents: 400,
    paymentCapCents: 90_000,
    niches: ["databases", "machine-learning"],
  },
  {
    title: "Security review of our auth flow",
    description: "A deep dive for an experienced audience.",
    isGated: true,
    maxSlots: 3,
    numFilledSlots: 0,
    maxApplications: 3,
    deadlineInDays: 2,
    status: "open",
    fixedFeeCents: 0,
    cpmRateCents: 0,
    paymentCapCents: 0,
    niches: ["cybersecurity"],
  },
  {
    title: "Our CLI in your daily workflow",
    description: "Show the commands you actually reach for.",
    isGated: true,
    maxSlots: 6,
    numFilledSlots: 1,
    maxApplications: 6,
    deadlineInDays: 30,
    status: "draft",
    fixedFeeCents: 45_000,
    cpmRateCents: 0,
    paymentCapCents: 0,
    niches: ["developer-tools", "productivity"],
  },
  {
    title: "Migrating off a legacy ORM",
    description: "Paused while we rewrite the brief.",
    isGated: true,
    maxSlots: 4,
    numFilledSlots: 0,
    maxApplications: 4,
    deadlineInDays: 25,
    status: "paused",
    fixedFeeCents: 50_000,
    cpmRateCents: 0,
    paymentCapCents: 0,
    niches: ["databases"],
  },
];

const BOILERPLATE = {
  targetApplicant: "Developers who publish regularly and can show working code on camera.",
  contentRequirements: "One video, 60 seconds or longer, with the product visible in use.",
  prohibitedClaims: "No performance or security claims we have not published ourselves.",
  disclosureRequirements: "Disclose the partnership in the post itself, not only the caption.",
  usageRights: "We may reshare the post on our own channels for twelve months.",
};

/** Builds the campaigns and opportunities a company sees, and the feed creators see. */
async function seedCompanyContent(
  ctx: MutationCtx,
  company: Doc<"companies">,
  admin: Doc<"companyUsers">,
) {
  const campaign = {
    companyId: company._id,
    createdBy: admin._id,
    objective: "Reach developers who are evaluating us this quarter.",
    product: "The platform's free tier and SDK.",
    audience: "Working developers with an existing audience.",
  };

  // One per status, so the campaigns list has something in every filter.
  const openCampaignId = await ctx.db.insert("campaigns", {
    ...campaign,
    title: "Developer launch",
    description: "Our main push for the new SDK.",
    status: "open",
    budgetCents: 1_500_000,
    startsAt: halfHourFromNow(-30),
    endsAt: halfHourFromNow(60),
  });
  await ctx.db.insert("campaigns", {
    ...campaign,
    title: "Conference season",
    description: "Still being written.",
    status: "draft",
    budgetCents: 400_000,
    startsAt: halfHourFromNow(14),
  });
  await ctx.db.insert("campaigns", {
    ...campaign,
    title: "Community spotlight",
    description: "On hold while we rework the budget.",
    status: "paused",
    budgetCents: 250_000,
    startsAt: halfHourFromNow(-10),
    endsAt: halfHourFromNow(40),
  });
  await ctx.db.insert("campaigns", {
    ...campaign,
    title: "Beta programme",
    description: "Finished last month.",
    status: "closed",
    budgetCents: 800_000,
    startsAt: halfHourFromNow(-90),
    endsAt: halfHourFromNow(-5),
  });

  const opportunityIds: Id<"opportunities">[] = [];
  for (const spec of OPPORTUNITIES) {
    const { deadlineInDays, niches, ...fields } = spec;
    opportunityIds.push(
      await ctx.db.insert("opportunities", {
        ...fields,
        ...BOILERPLATE,
        campaignId: openCampaignId,
        companyId: company._id,
        createdBy: admin._id,
        usesAiReviewDefault: false,
        deadline: halfHourFromNow(deadlineInDays),
        niches,
      }),
    );
  }
  return { openCampaignId, opportunityIds };
}

/** Gives the first creator a populated profile, feed state, and application history. */
async function seedCreatorContent(
  ctx: MutationCtx,
  creators: Doc<"creators">[],
  company: Doc<"companies">,
  opportunityIds: Id<"opportunities">[],
) {
  const [primary] = creators;
  // The first two are open and gated/ungated, which the feed filters split on.
  const [gatedWithRoom, ungatedWithRoom, ungatedFull, closingSoon] = opportunityIds;

  await updateCreatorNiches(ctx, primary._id, ["developer-tools", "ai-agents", "web-development"]);
  await ctx.db.patch("creators", primary._id, {
    githubLink: primary.githubLink ?? "https://github.com/example",
  });

  await ctx.db.insert("opportunityStars", {
    creatorId: primary._id,
    opportunityId: gatedWithRoom,
  });
  await ctx.db.insert("opportunityStars", {
    creatorId: primary._id,
    opportunityId: ungatedWithRoom,
  });
  // Starred but no longer visible, so the starred feed proves it skips those.
  await ctx.db.insert("opportunityStars", {
    creatorId: primary._id,
    opportunityId: opportunityIds[opportunityIds.length - 1],
  });

  // One per status the applications list can show.
  const applications: { opportunityId: Id<"opportunities">; app: Partial<Doc<"applications">> }[] =
    [
      {
        opportunityId: gatedWithRoom,
        app: { status: "pending", note: "I've shipped three agent demos this year." },
      },
      {
        opportunityId: closingSoon,
        app: {
          status: "offered",
          note: "I write about auth internals weekly.",
          offerExpiresAt: halfHourFromNow(3),
        },
      },
      {
        opportunityId: ungatedFull,
        app: { status: "opportunityFull", note: "Happy to turn this around quickly." },
      },
    ];
  const applicationIds: Id<"applications">[] = [];
  for (const { opportunityId, app } of applications) {
    applicationIds.push(
      await ctx.db.insert("applications", {
        opportunityId,
        creatorId: primary._id,
        companyId: company._id,
        status: "pending",
        statusLastUpdatedAt: Date.now(),
        ...app,
      } as Doc<"applications">),
    );
  }

  // A second creator applying gives the company side something to review.
  if (creators[1]) {
    applicationIds.push(
      await ctx.db.insert("applications", {
        opportunityId: gatedWithRoom,
        creatorId: creators[1]._id,
        companyId: company._id,
        status: "pending",
        note: "I'd focus on the deployment story.",
        statusLastUpdatedAt: Date.now(),
      }),
    );
  }
  return { primary, applicationIds, gatedWithRoom, closingSoon };
}

/** Notifications for both sides of the marketplace, read and unread. */
async function seedNotifications(
  ctx: MutationCtx,
  creatorUserId: Id<"users">,
  adminUserId: Id<"users">,
  applicationId: Id<"applications">,
  opportunityId: Id<"opportunities">,
) {
  const target = { kind: "application" as const, applicationId, opportunityId };

  await ctx.db.insert("notifications", {
    userId: creatorUserId,
    type: "applicationOffered",
    title: "You have an offer on Security review of our auth flow",
    body: "Accept before the offer expires.",
    target,
    isRead: false,
  });
  await ctx.db.insert("notifications", {
    userId: creatorUserId,
    type: "applicationOpportunityFull",
    title: "Explain our vector search in one minute filled up",
    target,
    isRead: false,
  });
  await ctx.db.insert("notifications", {
    userId: creatorUserId,
    type: "applicationRejected",
    title: "Your application wasn't selected",
    target,
    isRead: true,
  });

  await ctx.db.insert("notifications", {
    userId: adminUserId,
    type: "applicationReceived",
    title: "New application on Build an agent with our SDK",
    body: "Two creators are waiting for a decision.",
    target,
    isRead: false,
  });
  await ctx.db.insert("notifications", {
    userId: adminUserId,
    type: "applicationAccepted",
    title: "A creator accepted your offer",
    target,
    isRead: true,
  });
}

/** Pending invitations for the team invites page. */
async function seedInvites(ctx: MutationCtx, companyId: Id<"companies">) {
  const expiresAt = Date.now() + 7 * DAY;
  await ctx.db.insert("invites", {
    workosId: `invitation_seed_admin_${Date.now()}`,
    email: "new.admin@example.com",
    kind: "companyUser",
    companyId,
    role: "admin",
    expiresAt,
  });
  await ctx.db.insert("invites", {
    workosId: `invitation_seed_member_${Date.now()}`,
    email: "new.member@example.com",
    kind: "companyUser",
    companyId,
    role: "member",
    expiresAt,
  });
}

/**
 * Rebuilds every seeded table. Safe to re-run.
 *
 * @throws `invalid_state` with `no_company_admin` or `no_creators` when the
 * deployment has no accounts to attach the data to. Run the invite flows first.
 */
export const run = internalMutation({
  args: { creatorEmail: v.optional(v.string()), companyName: v.optional(v.string()) },
  returns: v.object({
    cleared: v.number(),
    company: v.string(),
    campaigns: v.number(),
    opportunities: v.number(),
    creators: v.number(),
    primaryCreator: v.string(),
  }),
  handler: async (ctx, args) => {
    const cleared = await clearOwnedTables(ctx);
    const { company, admin } = await requireSeedCompany(ctx, args.companyName);
    const creators = await requireSeedCreators(ctx, args.creatorEmail);

    const { opportunityIds } = await seedCompanyContent(ctx, company, admin);
    const { primary, applicationIds, gatedWithRoom } = await seedCreatorContent(
      ctx,
      creators,
      company,
      opportunityIds,
    );
    await seedNotifications(ctx, primary.userId, admin.userId, applicationIds[0], gatedWithRoom);
    await seedInvites(ctx, company._id);

    return {
      cleared,
      company: company.name,
      campaigns: 4,
      opportunities: opportunityIds.length,
      creators: creators.length,
      primaryCreator: (await ctx.db.get("users", primary.userId))?.email ?? "unknown",
    };
  },
});

/** Removes everything `run` creates, leaving accounts and companies in place. */
export const clear = internalMutation({
  args: {},
  returns: v.object({ cleared: v.number() }),
  handler: async (ctx) => ({ cleared: await clearOwnedTables(ctx) }),
});
