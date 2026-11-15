/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { createDispute } from "../../models/disputes";
import { requireReadableDisputeEvidence } from "../../models/media";
import { MAX_DELIVERABLE_EXAMPLES, requireSupportingMedia } from "../../models/supportingMedia";
import schema from "../../schema";
import {
  expectApiError,
  requireSeededUser,
  seedAssignmentFixture,
  seedCreatorId,
  seedUser,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

async function seedFile(
  t: TestConvex,
  ownerUserId: Id<"users">,
  overrides: Record<string, unknown> = {},
): Promise<Id<"mediaUploads">> {
  return await t.run((ctx) =>
    ctx.db.insert("mediaUploads", {
      ownerUserId,
      kind: "deliverable-example" as const,
      status: "complete" as const,
      contentType: "image/png",
      stagingKey: "staging/deliverable-example/test",
      permanentKey: "media/deliverable-example/test",
      sizeBytes: 1024,
      grantExpiresAt: Date.now() + 60_000,
      ...overrides,
    }),
  );
}

describe("requireSupportingMedia", () => {
  test("returns the caller's completed files, deduplicated in order", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "files_owner" });
    const userId = (await requireSeededUser(t, "files_owner"))._id;
    const first = await seedFile(t, userId);
    const second = await seedFile(t, userId);

    expect(
      await t.run((ctx) =>
        requireSupportingMedia(
          ctx,
          userId,
          "deliverable-example",
          [second, first, second],
          MAX_DELIVERABLE_EXAMPLES,
        ),
      ),
    ).toEqual([second, first]);
  });

  test("refuses another user's file as not_found", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "files_caller" });
    const userId = (await requireSeededUser(t, "files_caller"))._id;
    await seedUser(t, { subject: "files_stranger" });
    const otherId = (await requireSeededUser(t, "files_stranger"))._id;
    const theirs = await seedFile(t, otherId);

    await expectApiError(
      () =>
        t.run((ctx) =>
          requireSupportingMedia(
            ctx,
            userId,
            "deliverable-example",
            [theirs],
            MAX_DELIVERABLE_EXAMPLES,
          ),
        ),
      "not_found",
    );
  });

  test("refuses a file of another kind as not_found", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "files_wrong_kind" });
    const userId = (await requireSeededUser(t, "files_wrong_kind"))._id;
    const evidence = await seedFile(t, userId, { kind: "dispute-evidence" });

    await expectApiError(
      () =>
        t.run((ctx) =>
          requireSupportingMedia(
            ctx,
            userId,
            "deliverable-example",
            [evidence],
            MAX_DELIVERABLE_EXAMPLES,
          ),
        ),
      "not_found",
    );
  });

  test("refuses an upload that never finished", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "files_pending" });
    const userId = (await requireSeededUser(t, "files_pending"))._id;
    const pending = await seedFile(t, userId, { status: "pending", permanentKey: undefined });

    await expectApiError(
      () =>
        t.run((ctx) =>
          requireSupportingMedia(
            ctx,
            userId,
            "deliverable-example",
            [pending],
            MAX_DELIVERABLE_EXAMPLES,
          ),
        ),
      "invalid_state",
      "upload_not_complete",
    );
  });

  test("refuses more files than the cap, counting after deduplication", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "files_too_many" });
    const userId = (await requireSeededUser(t, "files_too_many"))._id;
    const files: Id<"mediaUploads">[] = [];
    for (let i = 0; i <= MAX_DELIVERABLE_EXAMPLES; i++) files.push(await seedFile(t, userId));

    await expectApiError(
      () =>
        t.run((ctx) =>
          requireSupportingMedia(
            ctx,
            userId,
            "deliverable-example",
            files,
            MAX_DELIVERABLE_EXAMPLES,
          ),
        ),
      "invalid_state",
      "too_many_files",
    );
  });
});

describe("requireReadableDisputeEvidence", () => {
  async function seedDisputeWithEvidence(t: TestConvex, uploader: "creator" | "company") {
    const fixture = await seedAssignmentFixture(t);
    const ownerUserId = uploader === "creator" ? fixture.creatorUserId : fixture.membership.userId;
    const mediaId = await t.run((ctx) =>
      ctx.db.insert("mediaUploads", {
        ownerUserId,
        assignmentId: fixture.assignmentId,
        kind: "dispute-evidence" as const,
        status: "complete" as const,
        contentType: "image/png",
        stagingKey: "staging/dispute-evidence/test",
        permanentKey: "media/dispute-evidence/test",
        sizeBytes: 1024,
        grantExpiresAt: Date.now() + 60_000,
      }),
    );
    const disputeId = await t.run((ctx) =>
      createDispute(ctx, { role: "creator", creatorId: fixture.creatorId }, fixture.creatorUserId, {
        assignmentId: fixture.assignmentId,
        reason: "paymentNotReceived",
        description: "The fixed fee never arrived.",
        ...(uploader === "creator" ? { evidenceMediaIds: [mediaId] } : {}),
      }),
    );
    if (uploader === "company") {
      await t.run((ctx) => ctx.db.patch("disputes", disputeId, { evidenceMediaIds: [mediaId] }));
    }
    return { fixture, disputeId, mediaId };
  }

  test("the company reads evidence the creator uploaded", async () => {
    const t = convexTest(schema, modules);
    const { fixture, disputeId, mediaId } = await seedDisputeWithEvidence(t, "creator");

    const upload = await t.run((ctx) =>
      requireReadableDisputeEvidence(
        ctx,
        { role: "company", companyId: fixture.membership.companyId },
        disputeId,
        mediaId,
      ),
    );
    expect(upload._id).toEqual(mediaId);
  });

  test("the creator reads evidence the company uploaded", async () => {
    const t = convexTest(schema, modules);
    const { fixture, disputeId, mediaId } = await seedDisputeWithEvidence(t, "company");

    const upload = await t.run((ctx) =>
      requireReadableDisputeEvidence(
        ctx,
        { role: "creator", creatorId: fixture.creatorId },
        disputeId,
        mediaId,
      ),
    );
    expect(upload._id).toEqual(mediaId);
  });

  test("an unrelated creator reads nothing", async () => {
    const t = convexTest(schema, modules);
    const { disputeId, mediaId } = await seedDisputeWithEvidence(t, "creator");
    const strangerId = await seedCreatorId(t, "evidence_stranger");

    await expectApiError(
      () =>
        t.run((ctx) =>
          requireReadableDisputeEvidence(
            ctx,
            { role: "creator", creatorId: strangerId },
            disputeId,
            mediaId,
          ),
        ),
      "not_found",
    );
  });

  test("a file the dispute no longer cites stops being readable", async () => {
    const t = convexTest(schema, modules);
    const { fixture, disputeId, mediaId } = await seedDisputeWithEvidence(t, "creator");
    await t.run((ctx) => ctx.db.patch("disputes", disputeId, { evidenceMediaIds: [] }));

    await expectApiError(
      () =>
        t.run((ctx) =>
          requireReadableDisputeEvidence(
            ctx,
            { role: "creator", creatorId: fixture.creatorId },
            disputeId,
            mediaId,
          ),
        ),
      "not_found",
    );
  });
});
