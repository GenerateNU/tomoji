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

type CreateArgs = FunctionArgs<typeof api.disputes.create>;

function createArgs(fixture: AssignmentFixture, reason: CreateArgs["reason"]): CreateArgs {
  return {
    assignmentId: fixture.assignmentId,
    reason,
    description: "The video went live on Oct 1 and the fixed fee hasn't arrived.",
  };
}

const openList = { status: "open", paginationOpts: { numItems: 10, cursor: null } } as const;

type Client = Pick<TestConvex, "mutation" | "query">;
type Caller = (t: TestConvex, fixture: AssignmentFixture) => Promise<Client>;

const openers: [string, Caller, "creator" | "company" | "operator", CreateArgs["reason"]][] = [
  ["the creator", async (_t, fixture) => fixture.asCreator, "creator", "paymentNotReceived"],
  ["the company user", async (_t, fixture) => fixture.asCompany, "company", "missingDisclosure"],
  ["an operator", async (t) => await seedOperator(t, "dc-operator"), "operator", "payoutAmount"],
];

describe("disputes.create", () => {
  test.each(openers)("lets %s open a dispute", async (_who, caller, role, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const client = await caller(t, fixture);

    const disputeId = await client.mutation(api.disputes.create, createArgs(fixture, reason));

    expect(await storedDisputes(t)).toMatchObject([{ _id: disputeId, openedByRole: role }]);
  });

  test("refuses a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expectApiError(
      () => t.mutation(api.disputes.create, createArgs(fixture, "other")),
      "not_authenticated",
    );
  });

  test("conceals another company's assignment without writing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { asMember } = await seedMembership(t, "outsider");

    await expectApiError(
      () => asMember.mutation(api.disputes.create, createArgs(fixture, "missingDisclosure")),
      "not_found",
    );
    expect(await storedDisputes(t)).toEqual([]);
  });

  test("refuses a company user whose token names an org they don't belong to", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.mutation(api.disputes.create, createArgs(fixture, "missingDisclosure")),
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
      reason: "missingDisclosure",
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
  test("lists the caller's side and returns what get returns", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    for (const client of [fixture.asCreator, fixture.asCompany]) {
      const { page } = await client.query(api.disputes.list, openList);
      expect(page).toEqual([await client.query(api.disputes.get, { disputeId })]);
    }
  });

  test("shows another company nothing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedDispute(t, fixture);
    const { asMember } = await seedMembership(t, "outsider");

    const { page } = await asMember.query(api.disputes.list, openList);

    expect(page).toEqual([]);
  });

  test.each([
    ["an operator", async (t: TestConvex) => await seedOperator(t, "dl-operator")],
    ["a company user with the wrong org", seedWrongOrgCaller],
  ])("refuses %s", async (_who, caller) => {
    const t = convexTest(schema, modules);
    const client = await caller(t);

    await expectApiError(() => client.query(api.disputes.list, openList), "forbidden");
  });
});
