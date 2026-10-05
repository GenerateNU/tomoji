import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireCallerCreatorId, requireRole, requireUser } from "../models/users";
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

/** Who is reading a resource, resolved from the caller's account type. */
export type Viewer =
  | { role: "operator" }
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> };

/**
 * Resolves who the caller is for access checks on a resource.
 *
 * @throws `not_found` {resource: "creator"} if a creator has no creator row.
 * @throws `forbidden` or `misconfigured` if a company user's token has no valid
 * organization.
 * @throws `not_found` if a company user isn't a member of the token's org.
 */
export async function resolveViewer(ctx: Ctx, user: Doc<"users">): Promise<Viewer> {
  switch (user.role) {
    case "operator":
      return { role: "operator" };
    case "creator":
      return { role: "creator", creatorId: await requireCallerCreatorId(ctx, user) };
    case "company": {
      // Proves membership in the token's org, not just the account type.
      const { membership } = await companyContext(ctx);
      return { role: "company", companyId: membership.companyId };
    }
  }
}

export const authedQuery = customQuery(query, customCtx(authedContext));
export const authedMutation = customMutation(mutation, customCtx(authedContext));

export const companyQuery = customQuery(query, customCtx(companyContext));
export const companyMutation = customMutation(mutation, customCtx(companyContext));

export const creatorQuery = customQuery(query, customCtx(creatorContext));
export const creatorMutation = customMutation(mutation, customCtx(creatorContext));

export const operatorQuery = customQuery(query, customCtx(operatorContext));
export const operatorMutation = customMutation(mutation, customCtx(operatorContext));
