import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireRole, requireUser, requireCallerCreatorId } from "../models/users";
import type { Doc, Id } from "../_generated/dataModel";
import type { ResourceViewer } from "./authz";
import { apiError } from "./errors";
import { requireMembership } from "../models/companyUsers";

/**
 * Function builders that enforce the caller's account type before the handler
 * runs, so `ctx.user` is always present and correct.
 *
 * Use these instead of the raw `query` / `mutation` for anything touching user
 * data. The point is that a company endpoint cannot be written without the
 * check.
 */

type Ctx = QueryCtx | MutationCtx;

/** Any signed-in, synced, active user — no account-type restriction. */
export async function authedContext(ctx: Ctx) {
  return await requireUser(ctx);
}

/**
 * A company caller acting on their own company.
 *
 * Operators have no company of their own, so they reach company routes through
 * `companyScopeContext`, which takes the company as an argument.
 */
export async function companyContext(ctx: Ctx) {
  const { identity, user, orgId } = await requireRole(ctx, "company");
  if (orgId === null) {
    throw apiError("misconfigured", { reason: "company account has no organization" });
  }
  const membership = await requireMembership(ctx, user._id, orgId);
  return { identity, user, orgId, membership };
}

/**
 * Which company a call acts on, and who is acting. `membership` is null only
 * for operators, who have no row of their own; everything that attributes work
 * to a company user has to tolerate that.
 */
export type CompanyScope = {
  companyId: Id<"companies">;
  membership: Doc<"companyUsers"> | null;
};

/**
 * Resolves the company a call acts on. A company user always acts on their own,
 * and supplying `companyId` is refused so a member cannot reach another
 * company by guessing an id. An operator must supply one.
 *
 * @throws `forbidden` with reason `company_scope_not_allowed` if a non-operator
 * names a company, or `company_required` if an operator names none.
 */
export async function requireCompanyScope(
  ctx: Ctx,
  user: Doc<"users">,
  companyId?: Id<"companies">,
): Promise<CompanyScope> {
  if (user.role === "operator") {
    if (companyId === undefined) {
      throw apiError("forbidden", { reason: "company_required" });
    }
    const company = await ctx.db.get("companies", companyId);
    if (company === null) throw apiError("not_found", { resource: "company" });
    return { companyId, membership: null };
  }
  if (companyId !== undefined) {
    throw apiError("forbidden", { reason: "company_scope_not_allowed" });
  }
  const { membership } = await companyContext(ctx);
  return { companyId: membership.companyId, membership };
}

export async function creatorContext(ctx: Ctx) {
  const { identity, user } = await requireRole(ctx, "creator");
  return { identity, user };
}

export async function operatorContext(ctx: Ctx) {
  const { identity, user } = await requireRole(ctx, "operator");
  return { identity, user };
}

/**
 * A company caller who administers their company. Member-level callers are
 * refused here so an admin-only route cannot be written without the check.
 *
 * @throws `forbidden` with reason `company_admin_required`.
 */
export async function companyAdminContext(ctx: Ctx) {
  const context = await companyContext(ctx);
  if (context.membership.role !== "admin") {
    throw apiError("forbidden", { reason: "company_admin_required" });
  }
  return context;
}

/** Resolves ownership scope from an already-authenticated user, verifying the token's company org. */
export async function requireCallerViewer(ctx: Ctx, user: Doc<"users">): Promise<ResourceViewer> {
  switch (user.role) {
    case "operator":
      return { role: "operator" };
    case "creator":
      return { role: "creator", creatorId: await requireCallerCreatorId(ctx, user) };
    case "company": {
      const { membership } = await companyContext(ctx);
      return { role: "company", companyId: membership.companyId };
    }
  }
}

/**
 * Like `requireCallerViewer`, but a company caller must administer their
 * company. Use it for actions only an admin may take on a route that also
 * serves creators and operators, such as opening or resolving a dispute.
 *
 * @throws `forbidden` with reason `company_admin_required`.
 */
export async function requireCallerAdminViewer(
  ctx: Ctx,
  user: Doc<"users">,
): Promise<ResourceViewer> {
  if (user.role !== "company") return await requireCallerViewer(ctx, user);
  const { membership } = await companyAdminContext(ctx);
  return { role: "company", companyId: membership.companyId };
}

/**
 * Routes a company user and an operator can both call. The optional
 * `companyId` names the company an operator acts on; a company user must omit
 * it and always acts on their own. Handlers get `ctx.companyId` and a
 * `ctx.membership` that is null for operators.
 */
const companyScopeArgs = { companyId: v.optional(v.id("companies")) };

async function companyScopeInput(ctx: Ctx, args: { companyId?: Id<"companies"> }) {
  const { identity, user } = await requireUser(ctx);
  const scope = await requireCompanyScope(ctx, user, args.companyId);
  return { ctx: { identity, user, ...scope }, args: {} };
}

export const companyScopedQuery = customQuery(query, {
  args: companyScopeArgs,
  input: companyScopeInput,
});
export const companyScopedMutation = customMutation(mutation, {
  args: companyScopeArgs,
  input: companyScopeInput,
});

export const authedQuery = customQuery(query, customCtx(authedContext));
export const authedMutation = customMutation(mutation, customCtx(authedContext));

export const companyQuery = customQuery(query, customCtx(companyContext));
export const companyMutation = customMutation(mutation, customCtx(companyContext));

export const companyAdminQuery = customQuery(query, customCtx(companyAdminContext));
export const companyAdminMutation = customMutation(mutation, customCtx(companyAdminContext));

export const creatorQuery = customQuery(query, customCtx(creatorContext));
export const creatorMutation = customMutation(mutation, customCtx(creatorContext));

export const operatorQuery = customQuery(query, customCtx(operatorContext));
export const operatorMutation = customMutation(mutation, customCtx(operatorContext));
