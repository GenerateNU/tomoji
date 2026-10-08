/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedDispute,
  seedMembership,
  seedOperator,
  seedWrongOrgCaller,
  storedDisputes,
  type AssignmentFixture,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

function createArgs(fixture: AssignmentFixture): FunctionArgs<typeof api.disputes.create> {
  return {
    assignmentId: fixture.assignmentId,
    reason: "Payment not received",
    description: "The video went live on Oct 1 and the fixed fee hasn't arrived.",
  };
}

function pageArgs(fixture: AssignmentFixture) {
  return { assignmentId: fixture.assignmentId, paginationOpts: { numItems: 10, cursor: null } };
}

type Client = Pick<TestConvex, "mutation" | "query">;
type Caller = (t: TestConvex, fixture: AssignmentFixture) => Promise<Client>;

const openers: [string, Caller, "creator" | "company" | "operator"][] = [
  ["the creator", async (_t, fixture) => fixture.asCreator, "creator"],
  ["the company user", async (_t, fixture) => fixture.asCompany, "company"],
  ["an operator", async (t) => await seedOperator(t, "dc-operator"), "operator"],
];

describe("disputes.create", () => {
  test.each(openers)("lets %s open a dispute", async (_who, caller, role) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const client = await caller(t, fixture);

    const disputeId = await client.mutation(api.disputes.create, createArgs(fixture));

    expect(await storedDisputes(t)).toMatchObject([{ _id: disputeId, openedByRole: role }]);
  });

  test("refuses a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expectApiError(
      () => t.mutation(api.disputes.create, createArgs(fixture)),
      "not_authenticated",
    );
  });

  test("conceals another company's assignment without writing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { asMember } = await seedMembership(t, "outsider");

    await expectApiError(
      () => asMember.mutation(api.disputes.create, createArgs(fixture)),
      "not_found",
    );
    expect(await storedDisputes(t)).toEqual([]);
  });

  test("refuses a company user whose token names an org they don't belong to", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.mutation(api.disputes.create, createArgs(fixture)),
      "forbidden",
    );
  });
});

describe("disputes.get", () => {
  test("hides who opened it from the creator, not from the company", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture, {
      openedBy: fixture.membership.userId,
      openedByRole: "company",
    });

    const creatorView = await fixture.asCreator.query(api.disputes.get, { disputeId });
    const companyView = await fixture.asCompany.query(api.disputes.get, { disputeId });

    expect(creatorView).not.toHaveProperty("openedBy");
    expect(creatorView.openedByRole).toBe("company");
    expect(companyView.openedBy).toBe(fixture.membership.userId);
  });

  test("conceals another company's dispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { asMember } = await seedMembership(t, "outsider");

    await expectApiError(() => asMember.query(api.disputes.get, { disputeId }), "not_found");
  });
});

describe("disputes.list", () => {
  test("returns what get returns to the same caller", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    for (const client of [fixture.asCreator, fixture.asCompany]) {
      const { page } = await client.query(api.disputes.list, pageArgs(fixture));
      expect(page).toEqual([await client.query(api.disputes.get, { disputeId })]);
    }
  });

  test("conceals another company's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { asMember } = await seedMembership(t, "outsider");

    await expectApiError(() => asMember.query(api.disputes.list, pageArgs(fixture)), "not_found");
  });
});
