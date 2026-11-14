/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { listOpportunityDeliverables, MAX_DELIVERABLES } from "../../models/deliverableDrafts";
import {
  createDeliverable,
  listDeliverables,
  removeDeliverable,
  updateDeliverable,
} from "../../models/deliverables";
import { createOpportunity, publishOpportunity } from "../../models/opportunities";
import schema from "../../schema";
import {
  deliverableArgs,
  expectApiError,
  opportunityArgs,
  requireSeededUser,
  seedAssignment,
  seedAiReviewFixture,
  seedMembership,
  seedCampaign,
  seedCreatorId,
  seedOpportunity,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

async function storedDeliverables(t: TestConvex, opportunityId: Id<"opportunities">) {
  return await t.run((ctx) =>
    ctx.db
      .query("deliverables")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
      .collect(),
  );
}

describe("deliverable example files", () => {
  test("stores the company member's examples, deduplicated", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "examples_owner" });
    const example = await t.run((ctx) =>
      ctx.db.insert("mediaUploads", {
        ownerUserId: owner.membership.userId,
        companyId: owner.membership.companyId,
        kind: "deliverable-example" as const,
        status: "complete" as const,
        contentType: "application/pdf",
        stagingKey: "staging/deliverable-example/test",
        permanentKey: "media/deliverable-example/test",
        sizeBytes: 2048,
        grantExpiresAt: Date.now() + 60_000,
      }),
    );

    const opportunityId = await t.run((ctx) =>
      createOpportunity(
        ctx,
        owner.membership,
        opportunityArgs(owner.campaignId, {
          deliverables: [deliverableArgs({ exampleMediaIds: [example, example] })],
        }),
      ),
    );

    expect(await t.run((ctx) => listOpportunityDeliverables(ctx, opportunityId))).toMatchObject([
      { exampleMediaIds: [example] },
    ]);
  });

  test("refuses an example uploaded by someone else and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedCampaign(t, { subject: "examples_owner_two" });
    const stranger = await seedCampaign(t, {
      subject: "examples_stranger",
      orgId: "org_examples_other",
    });
    const theirs = await t.run((ctx) =>
      ctx.db.insert("mediaUploads", {
        ownerUserId: stranger.membership.userId,
        companyId: stranger.membership.companyId,
        kind: "deliverable-example" as const,
        status: "complete" as const,
        contentType: "image/png",
        stagingKey: "staging/deliverable-example/other",
        permanentKey: "media/deliverable-example/other",
        sizeBytes: 2048,
        grantExpiresAt: Date.now() + 60_000,
      }),
    );

    await expectApiError(
      () =>
        t.run((ctx) =>
          createOpportunity(
            ctx,
            owner.membership,
            opportunityArgs(owner.campaignId, {
              deliverables: [deliverableArgs({ exampleMediaIds: [theirs] })],
            }),
          ),
        ),
      "not_found",
    );
    expect(await t.run((ctx) => ctx.db.query("opportunities").take(1))).toEqual([]);
  });
});

describe("createOpportunity with deliverables", () => {
  test("stores the brief's deliverables, trimmed, in the order given", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, {
      subject: "brief_owner",
    });
    const opportunityId = await t.run((ctx) =>
      createOpportunity(
        ctx,
        membership,
        opportunityArgs(campaignId, {
          deliverables: [
            deliverableArgs({ title: "  Launch video  " }),
            deliverableArgs({
              title: "Follow-up thread",
              description: "Three posts on results.",
            }),
          ],
        }),
      ),
    );

    const stored = await storedDeliverables(t, opportunityId);
    expect(stored).toMatchObject([
      { opportunityId, createdBy: membership._id, title: "Launch video" },
      { title: "Follow-up thread", description: "Three posts on results." },
    ]);
    const opportunity = await t.run((ctx) => ctx.db.get("opportunities", opportunityId));
    expect(opportunity).not.toHaveProperty("deliverables");
  });

  test("refuses to open an opportunity without deliverables", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, {
      subject: "brief_empty",
    });
    for (const deliverables of [undefined, []]) {
      await expectApiError(
        () =>
          t.run((ctx) =>
            createOpportunity(ctx, membership, opportunityArgs(campaignId, { deliverables })),
          ),
        "invalid_state",
        "deliverables_required",
      );
    }
  });

  test("allows a draft without deliverables", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, {
      subject: "brief_draft",
    });
    const opportunityId = await t.run((ctx) =>
      createOpportunity(
        ctx,
        membership,
        opportunityArgs(campaignId, {
          status: "draft",
          deliverables: undefined,
        }),
      ),
    );
    expect(await storedDeliverables(t, opportunityId)).toEqual([]);
  });

  test("rejects a blank deliverable or too many, creating nothing", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, {
      subject: "brief_invalid",
    });
    const cases = [
      {
        deliverables: [deliverableArgs({ title: "  " })],
        reason: "deliverableTitle_blank",
      },
      {
        deliverables: [deliverableArgs({ description: "x".repeat(5001) })],
        reason: "deliverableDescription_too_long",
      },
      {
        deliverables: Array.from({ length: MAX_DELIVERABLES + 1 }, () => deliverableArgs()),
        reason: "too_many_deliverables",
      },
    ];
    for (const { deliverables, reason } of cases) {
      await expectApiError(
        () =>
          t.run((ctx) =>
            createOpportunity(ctx, membership, opportunityArgs(campaignId, { deliverables })),
          ),
        "invalid_state",
        reason,
      );
    }
    expect(await t.run((ctx) => ctx.db.query("opportunities").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("deliverables").collect())).toEqual([]);
  });
});

describe("publishOpportunity", () => {
  test("refuses a draft with no deliverables until one is added", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "publish_empty" },
      { status: "draft", deliverables: undefined },
    );
    await expectApiError(
      () => t.run((ctx) => publishOpportunity(ctx, owner.membership, owner.opportunityId)),
      "invalid_state",
      "deliverables_required",
    );

    await t.run((ctx) =>
      createDeliverable(ctx, owner.membership, owner.opportunityId, deliverableArgs()),
    );
    const published = await t.run((ctx) =>
      publishOpportunity(ctx, owner.membership, owner.opportunityId),
    );
    expect(published.status).toBe("open");
  });
});

describe("createDeliverable", () => {
  test("adds a trimmed deliverable after the existing ones", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "add_owner" });
    const deliverableId = await t.run((ctx) =>
      createDeliverable(ctx, owner.membership, owner.opportunityId, {
        title: " Follow-up thread ",
        description: " Three posts on results. ",
        reviewCriteria: [{ id: "results", description: "Describe the results." }],
      }),
    );

    const stored = await storedDeliverables(t, owner.opportunityId);
    expect(stored.map((row) => row.title)).toEqual(["Launch video", "Follow-up thread"]);
    expect(stored[1]).toMatchObject({
      _id: deliverableId,
      opportunityId: owner.opportunityId,
      createdBy: owner.membership._id,
      description: "Three posts on results.",
    });
  });

  test("hides another company's opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, {
      subject: "add_victim",
      orgId: "org_victim",
    });
    const other = await seedCampaign(t, {
      subject: "add_other",
      orgId: "org_other",
    });
    await expectApiError(
      () =>
        t.run((ctx) =>
          createDeliverable(ctx, other.membership, owner.opportunityId, deliverableArgs()),
        ),
      "not_found",
    );
    expect(await storedDeliverables(t, owner.opportunityId)).toHaveLength(1);
  });

  test("refuses a closed opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "add_closed" });
    await t.run((ctx) => ctx.db.patch("opportunities", owner.opportunityId, { status: "closed" }));
    await expectApiError(
      () =>
        t.run((ctx) =>
          createDeliverable(ctx, owner.membership, owner.opportunityId, deliverableArgs()),
        ),
      "invalid_state",
      "opportunity_not_editable",
    );
  });

  test("refuses more than the limit", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "add_full" },
      {
        deliverables: Array.from({ length: MAX_DELIVERABLES }, () => deliverableArgs()),
      },
    );
    await expectApiError(
      () =>
        t.run((ctx) =>
          createDeliverable(ctx, owner.membership, owner.opportunityId, deliverableArgs()),
        ),
      "invalid_state",
      "too_many_deliverables",
    );
  });
});

describe("once the opportunity has an assignment", () => {
  test("deliverables can be added but not edited or removed, even if it was cancelled", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "locked_owner" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    const creatorId = await seedCreatorId(t, "locked_creator");
    await seedAssignment(t, {
      opportunityId: owner.opportunityId,
      creatorId,
      status: "cancelled",
    });

    await expectApiError(
      () =>
        t.run((ctx) =>
          updateDeliverable(ctx, owner.membership, deliverable._id, { title: "Launch reel" }),
        ),
      "invalid_state",
      "opportunity_has_assignments",
    );
    await expectApiError(
      () => t.run((ctx) => removeDeliverable(ctx, owner.membership, deliverable._id)),
      "invalid_state",
      "opportunity_has_assignments",
    );
    const addedId = await t.run((ctx) =>
      createDeliverable(
        ctx,
        owner.membership,
        owner.opportunityId,
        deliverableArgs({ title: "Story set" }),
      ),
    );

    expect(await storedDeliverables(t, owner.opportunityId)).toEqual([
      deliverable,
      expect.objectContaining({ _id: addedId, title: "Story set" }),
    ]);
  });
});

describe("updateDeliverable", () => {
  test("changes only the given fields, trimmed", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "edit_owner" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    const updated = await t.run((ctx) =>
      updateDeliverable(ctx, owner.membership, deliverable._id, {
        title: "  Unboxing video ",
      }),
    );

    const expected = { ...deliverable, title: "Unboxing video" };
    expect(updated).toEqual(expected);
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual([expected]);
  });

  test("rejects a blank title", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "edit_blank" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    await expectApiError(
      () =>
        t.run((ctx) =>
          updateDeliverable(ctx, owner.membership, deliverable._id, {
            title: "",
          }),
        ),
      "invalid_state",
      "deliverableTitle_blank",
    );
  });

  test("treats another company's deliverable the same as a deleted one", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "edit_victim", orgId: "org_victim" },
      {
        deliverables: [deliverableArgs(), deliverableArgs({ title: "Follow-up thread" })],
      },
    );
    const other = await seedCampaign(t, {
      subject: "edit_other",
      orgId: "org_other",
    });
    const [kept, deleted] = await storedDeliverables(t, owner.opportunityId);
    await t.run((ctx) => ctx.db.delete("deliverables", deleted._id));

    for (const deliverableId of [kept._id, deleted._id]) {
      await expect(
        t.run((ctx) =>
          updateDeliverable(ctx, other.membership, deliverableId, {
            title: "x",
          }),
        ),
      ).rejects.toMatchObject({
        data: { code: "not_found", resource: "deliverable" },
      });
      await expect(
        t.run((ctx) => removeDeliverable(ctx, other.membership, deliverableId)),
      ).rejects.toMatchObject({
        data: { code: "not_found", resource: "deliverable" },
      });
    }
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual([kept]);
  });
});

describe("removeDeliverable", () => {
  test("deletes a deliverable from an open opportunity that has others", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "remove_owner" },
      {
        deliverables: [deliverableArgs(), deliverableArgs({ title: "Follow-up thread" })],
      },
    );
    const [first, second] = await storedDeliverables(t, owner.opportunityId);
    await t.run((ctx) => removeDeliverable(ctx, owner.membership, first._id));
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual([second]);
  });

  test("keeps the last deliverable of a published opportunity", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_last" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    await expectApiError(
      () => t.run((ctx) => removeDeliverable(ctx, owner.membership, deliverable._id)),
      "invalid_state",
      "last_deliverable",
    );
  });

  test("lets a draft drop its last deliverable", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "remove_draft" }, { status: "draft" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    await t.run((ctx) => removeDeliverable(ctx, owner.membership, deliverable._id));
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual([]);
  });
});

describe("an opportunity past its deadline that the cron has not closed yet", () => {
  const DEADLINE_OFFSET_MS = 1_800_000;

  async function seedExpired(subject: string, status: "draft" | "open") {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject },
      {
        deadline: Date.now() + DEADLINE_OFFSET_MS,
        deliverables: [deliverableArgs(), deliverableArgs({ title: "Follow-up thread" })],
      },
    );
    await t.run((ctx) => ctx.db.patch("opportunities", owner.opportunityId, { status }));
    vi.advanceTimersByTime(DEADLINE_OFFSET_MS);
    const before = await storedDeliverables(t, owner.opportunityId);
    return { t, owner, before };
  }

  test("rejects adding a deliverable", async () => {
    const { t, owner, before } = await seedExpired("expired_create", "open");
    await expectApiError(
      () =>
        t.run((ctx) =>
          createDeliverable(ctx, owner.membership, owner.opportunityId, deliverableArgs()),
        ),
      "invalid_state",
      "opportunity_expired",
    );
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual(before);
  });

  test("rejects editing a deliverable", async () => {
    const { t, owner, before } = await seedExpired("expired_update", "open");
    await expectApiError(
      () =>
        t.run((ctx) =>
          updateDeliverable(ctx, owner.membership, before[0]._id, { title: "New title" }),
        ),
      "invalid_state",
      "opportunity_expired",
    );
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual(before);
  });

  test("a draft can still gain a deliverable", async () => {
    const { t, owner, before } = await seedExpired("expired_draft_create", "draft");
    await t.run((ctx) =>
      createDeliverable(
        ctx,
        owner.membership,
        owner.opportunityId,
        deliverableArgs({ title: "Story set" }),
      ),
    );
    const stored = await storedDeliverables(t, owner.opportunityId);
    expect(stored.map((row) => row.title)).toEqual([
      ...before.map((row) => row.title),
      "Story set",
    ]);
  });
});

describe("listDeliverables", () => {
  test("gives company users and operators the stored rows", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_owner" });
    const stored = await storedDeliverables(t, owner.opportunityId);
    const user = await requireSeededUser(t, "list_owner");
    const rows = await owner.asCompany.run((ctx) =>
      listDeliverables(ctx, { user, orgId: "org_acme" }, owner.opportunityId),
    );
    expect(rows).toEqual(stored);
  });

  test("gives creators the deliverables without who created them", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_creator_owner" });
    const [stored] = await storedDeliverables(t, owner.opportunityId);
    await seedCreatorId(t, "list_creator");
    const user = await requireSeededUser(t, "list_creator");
    const rows = await t.run((ctx) =>
      listDeliverables(ctx, { user, orgId: null }, owner.opportunityId),
    );
    expect(rows).toEqual([
      {
        _id: stored._id,
        _creationTime: stored._creationTime,
        opportunityId: owner.opportunityId,
        title: stored.title,
        description: stored.description,
        reviewCriteria: stored.reviewCriteria,
      },
    ]);
  });

  test("shows an assigned creator the deliverables after the opportunity closes", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_closed_owner" });
    const assignedId = await seedCreatorId(t, "list_assigned");
    await seedCreatorId(t, "list_stranger");
    await seedAssignment(t, {
      opportunityId: owner.opportunityId,
      creatorId: assignedId,
    });
    await t.run((ctx) => ctx.db.patch("opportunities", owner.opportunityId, { status: "closed" }));

    const assigned = await requireSeededUser(t, "list_assigned");
    const rows = await t.run((ctx) =>
      listDeliverables(ctx, { user: assigned, orgId: null }, owner.opportunityId),
    );
    expect(rows).toHaveLength(1);

    const stranger = await requireSeededUser(t, "list_stranger");
    await expectApiError(
      () =>
        t.run((ctx) => listDeliverables(ctx, { user: stranger, orgId: null }, owner.opportunityId)),
      "not_found",
    );
  });
});

test("companies can confirm criteria before assignments but not edit another company's deliverable", async () => {
  const t = convexTest(schema, modules);
  const { membership, opportunityId } = await seedOpportunity(t, { subject: "criteria-owner" });
  const id = await t.run((ctx) =>
    createDeliverable(ctx, membership, opportunityId, {
      title: "Demo",
      description: "Introduce Driftwood.",
      reviewCriteria: [{ id: " product ", description: " Mention Driftwood. " }],
    }),
  );
  expect(await t.run((ctx) => ctx.db.get("deliverables", id))).toMatchObject({
    reviewCriteria: [{ id: "product", description: "Mention Driftwood." }],
  });
  const other = await seedMembership(t, "criteria-intruder");
  await expectApiError(
    () => t.run((ctx) => updateDeliverable(ctx, other.membership, id, { reviewCriteria: [] })),
    "not_found",
  );
});

test("assignment locking also protects the confirmed criteria", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await expectApiError(
    () =>
      t.run((ctx) =>
        updateDeliverable(ctx, fixture.membership, fixture.deliverableId, { reviewCriteria: [] }),
      ),
    "invalid_state",
    "opportunity_has_assignments",
  );
});

test("editing criteria preserves the deliverable text and an empty array clears them", async () => {
  const t = convexTest(schema, modules);
  const { membership, opportunityId } = await seedOpportunity(
    t,
    { subject: "criteria-editor" },
    { usesAiReviewDefault: false },
  );
  const [deliverable] = await storedDeliverables(t, opportunityId);
  const updated = await t.run((ctx) =>
    updateDeliverable(ctx, membership, deliverable._id, {
      reviewCriteria: [{ id: "disclosure", description: " State the sponsorship. " }],
    }),
  );
  expect(updated).toEqual({
    ...deliverable,
    reviewCriteria: [{ id: "disclosure", description: "State the sponsorship." }],
  });
  const cleared = await t.run((ctx) =>
    updateDeliverable(ctx, membership, deliverable._id, { reviewCriteria: [] }),
  );
  expect(cleared).toEqual({ ...deliverable, reviewCriteria: [] });
  expect(await storedDeliverables(t, opportunityId)).toEqual([cleared]);
});

test("AI opportunities reject adding a deliverable without criteria", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedOpportunity(t, { subject: "ai-add-criteria" });
  await expectApiError(
    () =>
      t.run((ctx) =>
        createDeliverable(
          ctx,
          owner.membership,
          owner.opportunityId,
          deliverableArgs({ reviewCriteria: undefined }),
        ),
      ),
    "invalid_state",
    "ai_review_criteria_required",
  );
  expect(await storedDeliverables(t, owner.opportunityId)).toHaveLength(1);
});

test("AI opportunities cannot clear confirmed criteria", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedOpportunity(t, { subject: "ai-clear-criteria" });
  const [before] = await storedDeliverables(t, owner.opportunityId);
  await expectApiError(
    () =>
      t.run((ctx) => updateDeliverable(ctx, owner.membership, before._id, { reviewCriteria: [] })),
    "invalid_state",
    "ai_review_criteria_required",
  );
  expect(await storedDeliverables(t, owner.opportunityId)).toEqual([before]);
});

test("creator deliverables normalize criteria and return an empty array when absent", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedOpportunity(
    t,
    { subject: "manual-criteria" },
    {
      usesAiReviewDefault: false,
      deliverables: [
        deliverableArgs({ reviewCriteria: undefined }),
        deliverableArgs({
          reviewCriteria: [{ id: "product", description: "Mention the product." }],
        }),
      ],
    },
  );
  const stored = await storedDeliverables(t, owner.opportunityId);
  // Model writes already normalize; this row exercises the read boundary independently.
  await t.run((ctx) =>
    ctx.db.patch("deliverables", stored[1]._id, {
      reviewCriteria: [{ id: " product ", description: " Mention the product. " }],
    }),
  );
  await seedCreatorId(t, "criteria-reader");
  const user = await requireSeededUser(t, "criteria-reader");
  const rows = await t.run((ctx) =>
    listDeliverables(ctx, { user, orgId: null }, owner.opportunityId),
  );
  expect(rows.map((row) => row.reviewCriteria)).toEqual([
    [],
    [{ id: "product", description: "Mention the product." }],
  ]);
  expect(rows[0]).not.toHaveProperty("createdBy");
});
