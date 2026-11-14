import { defineTable } from "convex/server";
import { v } from "convex/values";

export const MAX_ADDITIONAL_LINKS = 3;

// Self-reported reach, so ranking needs no X API calls. Bounds live in models/followerRanges.ts.
export const followerRange = v.union(
  v.literal("under-1k"),
  v.literal("1k-5k"),
  v.literal("5k-10k"),
  v.literal("10k-50k"),
  v.literal("50k-100k"),
  v.literal("100k-500k"),
  v.literal("500k-plus"),
);

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
  followerRange: v.optional(followerRange),
  onboardingCompletedAt: v.optional(v.number()),
}).index("by_userId", ["userId"]);
