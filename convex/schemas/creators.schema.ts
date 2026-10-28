import { defineTable } from "convex/server";
import { v } from "convex/values";

export const MAX_ADDITIONAL_LINKS = 3;

export const creatorsTable = defineTable({
  userId: v.id("users"),
  githubLink: v.optional(v.string()),
  linkedinLink: v.optional(v.string()),
  // Anything else the creator wants to show, capped at MAX_ADDITIONAL_LINKS.
  additionalLinks: v.optional(v.array(v.string())),
  // Unix milliseconds at exact UTC midnight, so the date never shifts with the
  // reader's time zone. Optional because the row is created by the WorkOS
  // webhook, which has no date to supply; onboarding is what requires it.
  dateOfBirth: v.optional(v.number()),
  // ISO 3166-1 alpha-2, validated against the country list.
  countryOfResidence: v.optional(v.string()),
  bannerMediaId: v.optional(v.id("mediaUploads")),
  // Hides the creator from company-facing lists. Companies they have applied
  // to or been assigned by can still open their profile. Optional so rows
  // created before this field need no migration; read missing as "not private".
  isPrivate: v.optional(v.boolean()),
  // Legacy selections remain readable until backfilled into creatorNiches.
  // New writes use association rows and remove this field atomically.
  niches: v.optional(v.array(v.string())),
}).index("by_userId", ["userId"]);
