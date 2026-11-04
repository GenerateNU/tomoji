import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

export const mediaKind = v.union(
  v.literal("profile-picture"),
  v.literal("company-profile-picture"),
  v.literal("company-banner"),
  v.literal("video-submission"),
);
export type MediaKind = Infer<typeof mediaKind>;

/** The company kinds, which attach to a company rather than to the uploader. */
export const COMPANY_MEDIA_KINDS = ["company-profile-picture", "company-banner"] as const;
export type CompanyMediaKind = (typeof COMPANY_MEDIA_KINDS)[number];

export function isCompanyMediaKind(kind: MediaKind): kind is CompanyMediaKind {
  return (COMPANY_MEDIA_KINDS as readonly MediaKind[]).includes(kind);
}

/**
 * A grant belongs to one user and, depending on its kind, one assignment or
 * one company. The uploader is always a user; `companyId` records which
 * company the finished media belongs to, so it survives them leaving.
 */
export const mediaUploadsTable = defineTable({
  ownerUserId: v.id("users"),
  kind: mediaKind,
  assignmentId: v.optional(v.id("assignments")),
  companyId: v.optional(v.id("companies")),
  stagingKey: v.string(),
  contentType: v.string(),
  grantExpiresAt: v.number(),
  status: v.union(v.literal("pending"), v.literal("complete")),
  permanentKey: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
});
