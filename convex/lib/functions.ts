import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireRole, requireUser, requireCallerCreatorId } from "../models/users";
import type { Doc } from "../_generated/dataModel";
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

export async function companyContext(ctx: Ctx) {
  const { identity, user, orgId } = await requireRole(ctx, "company");
  if (orgId === null) {
    throw apiError("misconfigured", { reason: "company account has no organization" });
  }
  const membership = await requireMembership(ctx, user._id, orgId);
  return { identity, user, orgId, membership };
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
