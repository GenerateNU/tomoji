import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  companyAdminAction,
  companyAdminQuery,
  operatorAction,
  operatorQuery,
} from "./lib/functions";
import { apiError, type ApiErrorData } from "./lib/errors";
import { requireNonBlank } from "./lib/validation";
import { createWorkosOrganization, revokeInvite, sendInvite } from "./lib/workos";
import { createCompany, requireCompany } from "./models/companies";
import { listCompanyInvites, listInvitesByKind, requireRevocableInvite } from "./models/invites";
import schema from "./schema";
import { companyRole } from "./schemas/companyUsers.schema";
import { inviteKind } from "./schemas/invites.schema";

/**
 * Invites someone to join as a creator. No organization, so accepting makes a
 * plain creator account.
 *
 * @throws `conflict` if WorkOS already has a pending invitation for the email.
 */
export const inviteCreator = operatorAction({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await sendInvite({ email: requireNonBlank(args.email, "email") });
    return null;
  },
});

/**
 * Creates a company and invites its first admin. The WorkOS organization is
 * made here, and the `companies` row is written before the invite is sent so
 * the `invitation.created` webhook can attribute it to the company.
 *
 * Not safe to retry: a second call makes a second organization and company.
 * When the invite is the part that failed, the error carries the `companyId`
 * that was created, so the caller can finish with `inviteCompanyUser`.
 *
 * @throws `conflict` if WorkOS already has a pending invitation for the email.
 */
export const inviteCompany = operatorAction({
  args: { companyName: v.string(), email: v.string() },
  returns: v.id("companies"),
  handler: async (ctx, args): Promise<Id<"companies">> => {
    const name = requireNonBlank(args.companyName, "company_name");
    const email = requireNonBlank(args.email, "email");
    const organizationId = await createWorkosOrganization(name);
    const companyId: Id<"companies"> = await ctx.runMutation(internal.invites.registerCompany, {
      workosId: organizationId,
      name,
    });
    try {
      await sendInvite({ email, organizationId, roleSlug: "admin" });
    } catch (error) {
      throw withCompanyId(error, companyId);
    }
    return companyId;
  },
});

/** Re-throws a `sendInvite` failure with the company that was already created. */
function withCompanyId(error: unknown, companyId: Id<"companies">): unknown {
  if (!(error instanceof ConvexError)) return error;
  const data = error.data as ApiErrorData;
  return apiError(data.code, { ...data, companyId, companyCreated: true });
}

/**
 * Invites someone into a company that already exists. This is how an operator
 * recovers a company with no admin left to invite anyone.
 *
 * @throws `not_found` if the company does not exist.
 * @throws `conflict` if WorkOS already has a pending invitation for the email.
 */
export const inviteCompanyUser = operatorAction({
  args: { companyId: v.id("companies"), email: v.string(), role: companyRole },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organizationId: string = await ctx.runQuery(internal.invites.companyOrgId, {
      companyId: args.companyId,
    });
    await sendInvite({
      email: requireNonBlank(args.email, "email"),
      organizationId,
      roleSlug: args.role,
    });
    return null;
  },
});

/**
 * Invites a teammate into the caller's own company. Only admins may invite,
 * and they choose whether the teammate joins as an admin or a member.
 *
 * @throws `conflict` if WorkOS already has a pending invitation for the email.
 */
export const inviteTeammate = companyAdminAction({
  args: { email: v.string(), role: companyRole },
  returns: v.null(),
  handler: async (ctx, args) => {
    await sendInvite({
      email: requireNonBlank(args.email, "email"),
      organizationId: ctx.orgId,
      roleSlug: args.role,
    });
    return null;
  },
});

/** The caller's company's outstanding invitations, newest first. */
export const listMine = companyAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("invites")),
  handler: async (ctx, args) => {
    return await listCompanyInvites(ctx, ctx.membership.companyId, args.paginationOpts);
  },
});

/** Outstanding invitations of one kind, newest first. Operator-only. */
export const list = operatorQuery({
  args: { kind: inviteKind, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("invites")),
  handler: async (ctx, args) => {
    return await listInvitesByKind(ctx, args.kind, args.paginationOpts);
  },
});

/**
 * Cancels one of the caller's company's pending invitations. The row clears
 * when WorkOS confirms with `invitation.revoked`.
 *
 * @throws `not_found` if the invitation is missing or belongs to another company.
 */
export const revokeMine = companyAdminAction({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workosId: string = await ctx.runQuery(internal.invites.revocableWorkosId, {
      inviteId: args.inviteId,
      companyId: ctx.membership.companyId,
    });
    await revokeInvite(workosId);
    return null;
  },
});

/**
 * Cancels any pending invitation. Operator-only.
 *
 * @throws `not_found` if the invitation does not exist.
 */
export const revoke = operatorAction({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workosId: string = await ctx.runQuery(internal.invites.revocableWorkosId, {
      inviteId: args.inviteId,
      companyId: null,
    });
    await revokeInvite(workosId);
    return null;
  },
});

/** Records the company before its WorkOS organization has any members. */
export const registerCompany = internalMutation({
  args: { workosId: v.string(), name: v.string() },
  returns: v.id("companies"),
  handler: async (ctx, args) => {
    return await createCompany(ctx, args);
  },
});

/** The WorkOS organization to invite into. */
export const companyOrgId = internalQuery({
  args: { companyId: v.id("companies") },
  returns: v.string(),
  handler: async (ctx, args) => {
    return (await requireCompany(ctx, args.companyId)).workosId;
  },
});

/** The WorkOS invitation to revoke, once the caller is allowed to revoke it. */
export const revocableWorkosId = internalQuery({
  args: { inviteId: v.id("invites"), companyId: v.union(v.id("companies"), v.null()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const invite = await requireRevocableInvite(ctx, args.inviteId, args.companyId);
    return invite.workosId;
  },
});
