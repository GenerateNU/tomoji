/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { MAX_DELIVERABLES } from "../../models/deliverableDrafts";
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

describe("createOpportunity with deliverables", () => {
  test("stores the brief's deliverables, trimmed, in the order given", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, { subject: "brief_owner" });
    const opportunityId = await t.run((ctx) =>
      createOpportunity(
        ctx,
        membership,
        opportunityArgs(campaignId, {
          deliverables: [
            deliverableArgs({ title: "  Launch video  " }),
            deliverableArgs({ title: "Follow-up thread", description: "Three posts on results." }),
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
    const { membership, campaignId } = await seedCampaign(t, { subject: "brief_empty" });
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
    const { membership, campaignId } = await seedCampaign(t, { subject: "brief_draft" });
    const opportunityId = await t.run((ctx) =>
      createOpportunity(
        ctx,
        membership,
        opportunityArgs(campaignId, { status: "draft", deliverables: undefined }),
      ),
    );
    expect(await storedDeliverables(t, opportunityId)).toEqual([]);
  });

  test("rejects a blank deliverable or too many, creating nothing", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, { subject: "brief_invalid" });
    const cases = [
      { deliverables: [deliverableArgs({ title: "  " })], reason: "deliverableTitle_blank" },
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
    const owner = await seedOpportunity(t, { subject: "add_victim", orgId: "org_victim" });
    const other = await seedCampaign(t, { subject: "add_other", orgId: "org_other" });
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
      { deliverables: Array.from({ length: MAX_DELIVERABLES }, () => deliverableArgs()) },
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
  test("deliverables can't be added, edited, or removed, even if it was cancelled", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "locked_owner" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    const creatorId = await seedCreatorId(t, "locked_creator");
    await seedAssignment(t, { opportunityId: owner.opportunityId, creatorId, status: "cancelled" });

    await expectApiError(
      () =>
        t.run((ctx) =>
          createDeliverable(ctx, owner.membership, owner.opportunityId, deliverableArgs()),
        ),
      "invalid_state",
      "deliverables_locked",
    );
    await expectApiError(
      () =>
        t.run((ctx) =>
          updateDeliverable(ctx, owner.membership, deliverable._id, { title: "Changed" }),
        ),
      "invalid_state",
      "deliverables_locked",
    );
    await expectApiError(
      () => t.run((ctx) => removeDeliverable(ctx, owner.membership, deliverable._id)),
      "invalid_state",
      "deliverables_locked",
    );
    expect(await storedDeliverables(t, owner.opportunityId)).toEqual([deliverable]);
  });
});

describe("updateDeliverable", () => {
  test("changes only the given fields, trimmed", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "edit_owner" });
    const [deliverable] = await storedDeliverables(t, owner.opportunityId);
    const updated = await t.run((ctx) =>
      updateDeliverable(ctx, owner.membership, deliverable._id, { title: "  Unboxing video " }),
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
        t.run((ctx) => updateDeliverable(ctx, owner.membership, deliverable._id, { title: "" })),
      "invalid_state",
      "deliverableTitle_blank",
    );
  });

  test("treats another company's deliverable the same as a deleted one", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(
      t,
      { subject: "edit_victim", orgId: "org_victim" },
      { deliverables: [deliverableArgs(), deliverableArgs({ title: "Follow-up thread" })] },
    );
    const other = await seedCampaign(t, { subject: "edit_other", orgId: "org_other" });
    const [kept, deleted] = await storedDeliverables(t, owner.opportunityId);
    await t.run((ctx) => ctx.db.delete("deliverables", deleted._id));

    for (const deliverableId of [kept._id, deleted._id]) {
      await expect(
        t.run((ctx) => updateDeliverable(ctx, other.membership, deliverableId, { title: "x" })),
      ).rejects.toMatchObject({ data: { code: "not_found", resource: "deliverable" } });
      await expect(
        t.run((ctx) => removeDeliverable(ctx, other.membership, deliverableId)),
      ).rejects.toMatchObject({ data: { code: "not_found", resource: "deliverable" } });
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
      { deliverables: [deliverableArgs(), deliverableArgs({ title: "Follow-up thread" })] },
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
      },
    ]);
  });

  test("shows an assigned creator the deliverables after the opportunity closes", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_closed_owner" });
    const assignedId = await seedCreatorId(t, "list_assigned");
    await seedCreatorId(t, "list_stranger");
    await seedAssignment(t, { opportunityId: owner.opportunityId, creatorId: assignedId });
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
