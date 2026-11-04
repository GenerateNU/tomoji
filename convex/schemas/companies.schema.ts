import { defineTable } from "convex/server";
import { v } from "convex/values";

export const companiesTable = defineTable({
  workosId: v.string(),
  name: v.string(),
  isActive: v.boolean(),
  profilePictureMediaId: v.optional(v.id("mediaUploads")),
  bannerMediaId: v.optional(v.id("mediaUploads")),
  website: v.optional(v.string()),
  description: v.optional(v.string()),
  countryOfResidence: v.optional(v.string()),
  industry: v.optional(v.string()),
})
  .index("by_workosId", ["workosId"])
  .index("by_isActive", ["isActive"]);
