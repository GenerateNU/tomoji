/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { authorizeMediaUpload, finalizeMediaUpload, reserveMediaUpload } from "../../models/media";
import { requireUser } from "../../models/users";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedOpportunity,
  seedUser,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("authorizeMediaUpload", () => {
  test("rejects a creator uploading a video for another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const ownerCreatorId = await seedCreatorId(t, "video_owner");
    const otherCreator = await seedUser(t, { subject: "video_other" });
    const { opportunityId } = await seedOpportunity(t, { subject: "video_company" });
    const assignmentId = await seedAssignment(t, {
      opportunityId,
      creatorId: ownerCreatorId,
      status: "active",
    });

    await expectApiError(
      () =>
        otherCreator.run(async (ctx) => {
          const { user } = await requireUser(ctx);
          await authorizeMediaUpload(ctx, user, "video-submission", assignmentId);
        }),
      "not_found",
    );
  });
});

describe("profile-picture uploads", () => {
  test("finalizing an owned upload attaches a server-owned media ID to the user", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "profile_upload" });
    const uploadId = await asCreator.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      return await reserveMediaUpload(ctx, user, {
        kind: "profile-picture",
        stagingKey: "staging/profile-picture/11111111-1111-4111-8111-111111111111",
        contentType: "image/webp",
        grantExpiresAt: Date.now() + 15 * 60_000,
      });
    });

    await asCreator.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      await finalizeMediaUpload(ctx, user, uploadId, {
        stagingKey: "staging/profile-picture/11111111-1111-4111-8111-111111111111",
        permanentKey: "media/profile-picture/22222222-2222-4222-8222-222222222222",
        contentType: "image/webp",
        sizeBytes: 1024,
      });
    });

    const { upload, user } = await asCreator.run(async (ctx) => {
      const upload = await ctx.db.get("mediaUploads", uploadId);
      const { user } = await requireUser(ctx);
      return { upload, user };
    });
    expect(upload?.status).toBe("complete");
    expect(user.profilePictureMediaId).toBe(uploadId);
  });
});
