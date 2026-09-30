/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { ApiErrorCode } from "../lib/errors";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedOperator,
  seedUser,
  type AssignmentFixture,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const draft = {
  draftUrl: "https://drive.example.com/drafts/1",
  draftDescription: "30-second unboxing, product shown at 0:03.",
};

type CreateArgs = FunctionArgs<typeof api.submissions.create>;

function createArgs(fixture: AssignmentFixture): CreateArgs {
  return { assignmentId: fixture.assignmentId, ...draft };
}

async function storedSubmissions(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("submissions").collect());
}

type Caller = (t: TestConvex, fixture: AssignmentFixture) => Promise<Pick<TestConvex, "mutation">>;

// Only creators may submit drafts; every other caller is refused by the builder.
const wrongCallers: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  ["a company user", async (_t, fixture) => fixture.asCompany, "forbidden"],
  ["an operator", async (t) => await seedOperator(t, "sc-operator-user"), "forbidden"],
];

describe("submissions.create", () => {
  test("submits a pending draft on the caller's own assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sc-own", { usesAiReview: true });

    const id = await fixture.asCreator.mutation(api.submissions.create, createArgs(fixture));
    const stored = await t.run(async (ctx) => await ctx.db.get("submissions", id));

    expect(stored).toMatchObject({
      ...createArgs(fixture),
      status: "pending",
      usesAiReview: true,
    });
  });

  // The arg validator only accepts the draft fields, so a client cannot set the
  // server-owned fields. This pins that nobody widens it later.
  test.each([
    ["status", "approved"],
    ["usesAiReview", true],
  ] as const)("rejects a client-supplied %s", async (field, value) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, `sc-extra-${field}`);

    await expect(
      fixture.asCreator.mutation(api.submissions.create, {
        ...createArgs(fixture),
        [field]: value,
        // Bypasses the compile-time check to exercise the runtime validator,
        // which is what a malicious client would hit.
      } as never),
    ).rejects.toThrow(`Unexpected field \`${field}\``);

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sc-owner");
    const asIntruder = await seedUser(t, { subject: "sc-intruder" });

    await expectApiError(
      () => asIntruder.mutation(api.submissions.create, createArgs(fixture)),
      "not_found",
    );

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test.each(wrongCallers)(
    "rejects %s without writing a submission",
    async (_label, caller, code) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, "sc-caller");
      const client = await caller(t, fixture);

      await expectApiError(
        () => client.mutation(api.submissions.create, createArgs(fixture)),
        code,
      );

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );
});
