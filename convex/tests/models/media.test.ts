/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { getCompanyByWorkosId } from "../../models/companies";
import {
  authorizeMediaUpload,
  finalizeMediaUpload,
  requireReadableCompanyMedia,
  reserveMediaUpload,
} from "../../models/media";
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

describe("company media uploads", () => {
  async function reserve(
    account: Awaited<ReturnType<typeof seedUser>>,
    kind: "company-profile-picture" | "company-banner",
    id: string,
  ) {
    return await account.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      return await reserveMediaUpload(ctx, user, {
        kind,
        stagingKey: `staging/${kind}/${id}`,
        contentType: "image/png",
        grantExpiresAt: Date.now() + 15 * 60_000,
      });
    });
  }

  async function finalize(
    account: Awaited<ReturnType<typeof seedUser>>,
    uploadId: Id<"mediaUploads">,
    kind: "company-profile-picture" | "company-banner",
    id: string,
  ) {
    await account.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      await finalizeMediaUpload(ctx, user, uploadId, {
        stagingKey: `staging/${kind}/${id}`,
        permanentKey: `media/${kind}/${id}`,
        contentType: "image/png",
        sizeBytes: 2048,
      });
    });
  }

  test.each([
    ["company-profile-picture", "profilePictureMediaId"],
    ["company-banner", "bannerMediaId"],
  ] as const)("finalizing a %s attaches it to the admin's company", async (kind, field) => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "company_media_admin",
      org: { id: "org_media", role: "admin" },
    });
    const uploadId = await reserve(asAdmin, kind, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    await finalize(asAdmin, uploadId, kind, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const { upload, company } = await asAdmin.run(async (ctx) => {
      const upload = await ctx.db.get("mediaUploads", uploadId);
      const company = await getCompanyByWorkosId(ctx, "org_media");
      return { upload, company };
    });
    expect(upload?.status).toBe("complete");
    // The company is recorded on the grant, not re-derived at completion.
    expect(upload?.companyId).toBe(company?._id);
    expect(company?.[field]).toBe(uploadId);
  });

  test("refuses a company member who is not an admin", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, {
      subject: "company_media_member",
      org: { id: "org_media_member", role: "member" },
    });

    await expectApiError(
      () => reserve(asMember, "company-banner", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
      "forbidden",
    );
  });

  test("refuses a creator, who has no company to upload into", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "company_media_creator" });

    await expectApiError(
      () => reserve(asCreator, "company-profile-picture", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      "forbidden",
    );
  });

  test("refuses an assignment on a company kind", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "company_media_assignment",
      org: { id: "org_media_assignment", role: "admin" },
    });
    const creatorId = await seedCreatorId(t, "company_media_target");
    const { opportunityId } = await seedOpportunity(t, { subject: "company_media_owner" });
    const assignmentId = await seedAssignment(t, {
      opportunityId,
      creatorId,
      status: "active",
    });

    await expectApiError(
      () =>
        asAdmin.run(async (ctx) => {
          const { user } = await requireUser(ctx);
          await authorizeMediaUpload(ctx, user, "company-banner", assignmentId);
        }),
      "invalid_state",
    );
  });
});

describe("requireReadableCompanyMedia", () => {
  async function seedCompanyPicture(t: ReturnType<typeof convexTest>, org: string) {
    const asAdmin = await seedUser(t, { subject: `${org}_admin`, org: { id: org, role: "admin" } });
    const uploadId = await asAdmin.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      return await reserveMediaUpload(ctx, user, {
        kind: "company-profile-picture",
        stagingKey: `staging/company-profile-picture/${org}`,
        contentType: "image/png",
        grantExpiresAt: Date.now() + 15 * 60_000,
      });
    });
    await asAdmin.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      await finalizeMediaUpload(ctx, user, uploadId, {
        stagingKey: `staging/company-profile-picture/${org}`,
        permanentKey: `media/company-profile-picture/${org}`,
        contentType: "image/png",
        sizeBytes: 2048,
      });
    });
    return { asAdmin, uploadId };
  }

  test("returns the picture a company currently shows", async () => {
    const t = convexTest(schema, modules);
    const { uploadId } = await seedCompanyPicture(t, "org_readable");

    const upload = await t.run(async (ctx) => await requireReadableCompanyMedia(ctx, uploadId));

    expect(upload._id).toBe(uploadId);
  });

  test("stops returning a picture the company has replaced", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin, uploadId } = await seedCompanyPicture(t, "org_replaced");
    await asAdmin.run(async (ctx) => {
      const company = await getCompanyByWorkosId(ctx, "org_replaced");
      if (company === null) throw new Error("expected seeded company");
      await ctx.db.patch("companies", company._id, { profilePictureMediaId: undefined });
    });

    await expectApiError(
      () => t.run(async (ctx) => await requireReadableCompanyMedia(ctx, uploadId)),
      "not_found",
    );
  });

  test("stops returning a picture once the company is deactivated", async () => {
    const t = convexTest(schema, modules);
    const { asAdmin, uploadId } = await seedCompanyPicture(t, "org_inactive");
    await asAdmin.run(async (ctx) => {
      const company = await getCompanyByWorkosId(ctx, "org_inactive");
      if (company === null) throw new Error("expected seeded company");
      await ctx.db.patch("companies", company._id, { isActive: false });
    });

    await expectApiError(
      () => t.run(async (ctx) => await requireReadableCompanyMedia(ctx, uploadId)),
      "not_found",
    );
  });

  test("refuses a pending upload that was never completed", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "org_pending_admin",
      org: { id: "org_pending", role: "admin" },
    });
    const uploadId = await asAdmin.run(async (ctx) => {
      const { user } = await requireUser(ctx);
      return await reserveMediaUpload(ctx, user, {
        kind: "company-banner",
        stagingKey: "staging/company-banner/pending",
        contentType: "image/png",
        grantExpiresAt: Date.now() + 15 * 60_000,
      });
    });

    await expectApiError(
      () => t.run(async (ctx) => await requireReadableCompanyMedia(ctx, uploadId)),
      "not_found",
    );
  });
});
