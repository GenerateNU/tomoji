/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { seedAiReviewFixture } from "./helpers";

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
