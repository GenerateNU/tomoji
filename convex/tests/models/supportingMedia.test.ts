/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { MAX_DELIVERABLE_EXAMPLES, requireSupportingMedia } from "../../models/supportingMedia";
import schema from "../../schema";
import { expectApiError, requireSeededUser, seedUser, type TestConvex } from "../helpers";

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
