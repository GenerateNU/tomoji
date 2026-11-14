import { v, type Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";

/**
 * Convex has no count API, so a total is the number of rows read. Every count
 * here stops at this many and says so, rather than scanning an unbounded table
 * to render one tile.
 */
export const COUNT_CAP = 1000;

export const operatorCount = v.object({
  value: v.number(),
  /** The real total is at least `value`; the scan stopped at the cap. */
  capped: v.boolean(),
});

export const operatorOverview = v.object({
  companies: operatorCount,
  activeCompanies: operatorCount,
  activeCreators: operatorCount,
  openDisputes: operatorCount,
  openOpportunities: operatorCount,
  activeAssignments: operatorCount,
});

async function count(rows: Promise<unknown[]>): Promise<Infer<typeof operatorCount>> {
  const read = await rows;
  return { value: Math.min(read.length, COUNT_CAP), capped: read.length > COUNT_CAP };
}

/** The platform-wide tiles on the operator home page. */
export async function getOperatorOverview(ctx: QueryCtx): Promise<Infer<typeof operatorOverview>> {
  const take = COUNT_CAP + 1;
  const [
    companies,
    activeCompanies,
    activeCreators,
    openDisputes,
    openOpportunities,
    activeAssignments,
  ] = await Promise.all([
    count(ctx.db.query("companies").take(take)),
    count(
      ctx.db
        .query("companies")
        .withIndex("by_isActive", (q) => q.eq("isActive", true))
        .take(take),
    ),
    count(
      ctx.db
        .query("users")
        .withIndex("by_role_and_isActive", (q) => q.eq("role", "creator").eq("isActive", true))
        .take(take),
    ),
    count(
      ctx.db
        .query("disputes")
        .withIndex("by_status_and_resolvedAt", (q) => q.eq("status", "open"))
        .take(take),
    ),
    count(
      ctx.db
        .query("opportunities")
        .withIndex("by_status_and_deadline", (q) => q.eq("status", "open"))
        .take(take),
    ),
    count(
      ctx.db
        .query("assignments")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .take(take),
    ),
  ]);

  return {
    companies,
    activeCompanies,
    activeCreators,
    openDisputes,
    openOpportunities,
    activeAssignments,
  };
}
