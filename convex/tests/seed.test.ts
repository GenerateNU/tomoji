/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { seedAiReviewFixture, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

test("clearing seeded submissions also removes their AI review attempts and preserves accounts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);

  await t.mutation(internal.seed.clear, {});

  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get("users", fixture.creatorUserId))).not.toBeNull();
  expect(await t.mutation(internal.seed.clear, {})).toEqual({ cleared: 0 });
});

test("gives the signed-in creator assignments to dispute and a past dispute", async () => {
  const t = convexTest(schema, modules);
  await seedUser(t, { subject: "admin", org: { id: "org_seed", name: "Acme", role: "admin" } });
  const asCreator = await seedUser(t, { subject: "creator", email: "creator@example.com" });

  await t.mutation(internal.seed.run, { creatorEmail: "creator@example.com" });

  const options = await asCreator.query(api.assignments.searchMine, { companyName: "acme" });
  expect(options.map(({ companyName, status }) => ({ companyName, status }))).toEqual(
    expect.arrayContaining([
      { companyName: "Acme", status: "active" },
      { companyName: "Acme", status: "completed" },
    ]),
  );
  expect(options).toHaveLength(2);
  const past = await asCreator.query(api.disputes.list, {
    status: "resolved",
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(past.page).toMatchObject([
    { companyName: "Acme", status: "resolved", outcome: "approved" },
  ]);
});
