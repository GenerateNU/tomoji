/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  deliverableArgs,
  expectApiError,
  seedCreatorId,
  seedOperator,
  seedOpportunity,
  seedUser,
  workosIdentity,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("deliverables routes", () => {
  test("a company member adds, edits, lists, and removes deliverables", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "route_member", role: "member" });
    const { opportunityId } = owner;

    const deliverableId = await owner.asCompany.mutation(api.deliverables.create, {
      opportunityId,
      ...deliverableArgs({ title: "Follow-up thread" }),
    });
    const updated = await owner.asCompany.mutation(api.deliverables.update, {
      deliverableId,
      description: "Three posts on your results after two weeks.",
    });
    expect(updated).toMatchObject({
      _id: deliverableId,
      title: "Follow-up thread",
      description: "Three posts on your results after two weeks.",
      createdBy: owner.membership._id,
    });

    const listed = await owner.asCompany.query(api.deliverables.list, { opportunityId });
    expect(listed.map((row) => row.title)).toEqual(["Launch video", "Follow-up thread"]);

    expect(await owner.asCompany.mutation(api.deliverables.remove, { deliverableId })).toBeNull();
    expect(await owner.asCompany.query(api.deliverables.list, { opportunityId })).toHaveLength(1);
  });

  test("creators and operators can't change deliverables", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "route_owner" });
    const [deliverable] = await owner.asCompany.query(api.deliverables.list, {
      opportunityId: owner.opportunityId,
    });
    await seedCreatorId(t, "route_creator");
    const asCreator = t.withIdentity(workosIdentity({ subject: "route_creator" }));
    const asOperator = await seedOperator(t, "route_operator");

    for (const caller of [asCreator, asOperator]) {
      await expectApiError(
        () =>
          caller.mutation(api.deliverables.create, {
            opportunityId: owner.opportunityId,
            ...deliverableArgs(),
          }),
        "forbidden",
      );
      await expectApiError(
        () => caller.mutation(api.deliverables.update, { deliverableId: deliverable._id }),
        "forbidden",
      );
      await expectApiError(
        () => caller.mutation(api.deliverables.remove, { deliverableId: deliverable._id }),
        "forbidden",
      );
    }
  });

  test("list requires sign-in and hides other companies' opportunities", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "list_route_owner", orgId: "org_owner" });
    const asOther = await seedUser(t, { subject: "list_route_other", org: { id: "org_other" } });

    await expectApiError(
      () => t.query(api.deliverables.list, { opportunityId: owner.opportunityId }),
      "not_authenticated",
    );
    await expectApiError(
      () => asOther.query(api.deliverables.list, { opportunityId: owner.opportunityId }),
      "not_found",
    );
  });

  test("operators get the stored rows; creators get them without who created them", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedOpportunity(t, { subject: "view_owner" });
    const stored = await owner.asCompany.query(api.deliverables.list, {
      opportunityId: owner.opportunityId,
    });
    const asOperator = await seedOperator(t, "view_operator");
    await seedCreatorId(t, "view_creator");
    const asCreator = t.withIdentity(workosIdentity({ subject: "view_creator" }));

    expect(
      await asOperator.query(api.deliverables.list, { opportunityId: owner.opportunityId }),
    ).toEqual(stored);
    const creatorRows = await asCreator.query(api.deliverables.list, {
      opportunityId: owner.opportunityId,
    });
    expect(creatorRows).toHaveLength(1);
    expect(creatorRows[0]).not.toHaveProperty("createdBy");
  });
});
