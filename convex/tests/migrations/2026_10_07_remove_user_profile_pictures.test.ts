/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { describe, expect, test } from "vitest";
import { removeLegacyUserProfilePicture } from "../../migrations/2026_10_07_remove_user_profile_pictures";
import schema from "../../schema";

const modules = import.meta.glob("../../**/*.ts");
const transitionSchema = defineSchema({
  ...schema.tables,
  users: defineTable(
    schema.tables.users.validator.extend({ profilePicture: v.optional(v.string()) }),
  ),
});

describe("removeLegacyUserProfilePicture", () => {
  test("removes the legacy URL without changing the media ID or other user fields", async () => {
    const t = convexTest(transitionSchema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workosId: "legacy_picture",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        role: "operator",
        isActive: false,
        profilePicture: "https://example.com/legacy.jpg",
      });
      const mediaId = await ctx.db.insert("mediaUploads", {
        ownerUserId: userId,
        kind: "profile-picture",
        stagingKey: "staging/profile-picture/fixture",
        contentType: "image/webp",
        grantExpiresAt: 123,
        status: "pending",
      });
      await ctx.db.patch("users", userId, { profilePictureMediaId: mediaId });
      const before = (await ctx.db.get("users", userId))!;

      await removeLegacyUserProfilePicture(ctx, before);
      const after = (await ctx.db.get("users", userId))!;
      const { profilePicture, ...expected } = before;
      expect(profilePicture).toBe("https://example.com/legacy.jpg");
      expect(after).toEqual(expected);

      await removeLegacyUserProfilePicture(ctx, after);
      expect(await ctx.db.get("users", userId)).toEqual(expected);
    });
  });
});
