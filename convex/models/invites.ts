import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { getCompanyByWorkosId } from "./companies";

/** What WorkOS tells us about an invitation, normalized for our handlers. */
export type InviteEvent = {
  workosId: string;
  email: string;
  organizationId?: string;
  roleSlug?: string;
  expiresAt: number;
};

export type WorkosInvitation = {
  id: string;
  email: string;
  organizationId?: string | null;
  roleSlug?: string | null;
  expiresAt: string;
};

/**
 * Normalizes an invitation webhook payload. WorkOS sends `null` for the fields
 * that do not apply and an ISO timestamp for the expiry.
 *
 * @throws `invalid_state` if the expiry is not a date we can parse, which
 * would otherwise store `NaN` and make the invite look permanently expired.
 */
export function invitationFrom(data: WorkosInvitation): InviteEvent {
  const expiresAt = Date.parse(data.expiresAt);
  if (Number.isNaN(expiresAt)) {
    throw apiError("invalid_state", { reason: "unparseable_invite_expiry" });
  }
  return {
    workosId: data.id,
    email: data.email,
    organizationId: data.organizationId ?? undefined,
    roleSlug: data.roleSlug ?? undefined,
    expiresAt,
  };
}

async function getInviteByWorkosId(
  ctx: QueryCtx | MutationCtx,
  workosId: string,
): Promise<Doc<"invites"> | null> {
  return await ctx.db
    .query("invites")
    .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
    .unique();
}

/**
 * Records an invitation WorkOS has sent. The organization decides what the
 * recipient becomes: the staff org makes an operator, another org makes a
 * company user, and no organization makes a creator.
 *
 * An invite for an organization we have never seen is ignored rather than
 * guessed at; the company row appears when its first member accepts.
 */
export async function recordInvite(
  ctx: MutationCtx,
  event: InviteEvent,
  isOperatorOrg: boolean,
): Promise<void> {
  if (await getInviteByWorkosId(ctx, event.workosId)) return;

  if (event.organizationId === undefined) {
    await ctx.db.insert("invites", {
      workosId: event.workosId,
      email: event.email,
      kind: "creator",
      expiresAt: event.expiresAt,
    });
    return;
  }
  if (isOperatorOrg) {
    await ctx.db.insert("invites", {
      workosId: event.workosId,
      email: event.email,
      kind: "operator",
      expiresAt: event.expiresAt,
    });
    return;
  }

  const company = await getCompanyByWorkosId(ctx, event.organizationId);
  if (company === null) return;
  await ctx.db.insert("invites", {
    workosId: event.workosId,
    email: event.email,
    kind: "companyUser",
    companyId: company._id,
    role: event.roleSlug === "admin" ? "admin" : "member",
    expiresAt: event.expiresAt,
  });
}

/** Drops the row once WorkOS says the invitation is accepted or revoked. */
export async function closeInvite(ctx: MutationCtx, workosId: string): Promise<void> {
  const invite = await getInviteByWorkosId(ctx, workosId);
  if (invite !== null) await ctx.db.delete("invites", invite._id);
}

/** Pushes the expiry out after WorkOS resends an invitation. */
export async function refreshInvite(ctx: MutationCtx, event: InviteEvent): Promise<void> {
  const invite = await getInviteByWorkosId(ctx, event.workosId);
  if (invite === null) return;
  await ctx.db.patch("invites", invite._id, { expiresAt: event.expiresAt });
}

/** One company's outstanding invitations, newest first. */
export async function listCompanyInvites(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<"invites">>> {
  return await ctx.db
    .query("invites")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .order("desc")
    .paginate(paginationOpts);
}

/** Outstanding invitations of one kind across every company, newest first. */
export async function listInvitesByKind(
  ctx: QueryCtx,
  kind: Doc<"invites">["kind"],
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<"invites">>> {
  return await ctx.db
    .query("invites")
    .withIndex("by_kind", (q) => q.eq("kind", kind))
    .order("desc")
    .paginate(paginationOpts);
}

/** The WorkOS invitation id to revoke, once the caller is allowed to revoke it. */
export async function requireRevocableInvite(
  ctx: QueryCtx,
  inviteId: Id<"invites">,
  companyId: Id<"companies"> | null,
): Promise<Doc<"invites">> {
  const invite = await ctx.db.get("invites", inviteId);
  // A company admin may only revoke their own company's invitations.
  if (invite === null || (companyId !== null && invite.companyId !== companyId)) {
    throw apiError("not_found", { resource: "invite" });
  }
  return invite;
}
