import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireRole, requireUser } from "../models/users";
import { apiError } from "./errors";

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
  return { identity, user, orgId };
}

export async function creatorContext(ctx: Ctx) {
  const { identity, user } = await requireRole(ctx, "creator");
  return { identity, user };
}

export async function operatorContext(ctx: Ctx) {
  const { identity, user } = await requireRole(ctx, "operator");
  return { identity, user };
}

export const authedQuery = customQuery(query, customCtx(authedContext));
export const authedMutation = customMutation(mutation, customCtx(authedContext));

export const companyQuery = customQuery(query, customCtx(companyContext));
export const companyMutation = customMutation(mutation, customCtx(companyContext));

export const creatorQuery = customQuery(query, customCtx(creatorContext));
export const creatorMutation = customMutation(mutation, customCtx(creatorContext));

export const operatorQuery = customQuery(query, customCtx(operatorContext));
export const operatorMutation = customMutation(mutation, customCtx(operatorContext));
