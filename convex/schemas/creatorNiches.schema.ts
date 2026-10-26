import { defineTable } from "convex/server";
import { v } from "convex/values";

export const creatorNichesTable = defineTable({ creatorId: v.id("creators"), name: v.string() })
  .index("by_creatorId", ["creatorId"])
  .index("by_name_and_creatorId", ["name", "creatorId"]);
