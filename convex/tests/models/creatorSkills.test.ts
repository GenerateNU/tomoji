/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { listCreatorSkills, updateCreatorSkills } from "../../models/creatorSkills";
import schema from "../../schema";
import { expectApiError, seedCreatorId } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("updateCreatorSkills", () => {
  test("replaces and clears skills in selection order without duplicates or affecting another creator", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "skills_owner");
    const otherId = await seedCreatorId(t, "skills_other");
    await t.run(async (ctx) => {
      await updateCreatorSkills(ctx, otherId, ["python"]);
      await updateCreatorSkills(ctx, creatorId, ["react"]);
      await updateCreatorSkills(ctx, creatorId, ["TypeScript", "C++", "typescript"]);
      await updateCreatorSkills(ctx, creatorId, ["typescript", "c-plus-plus"]);
    });

    expect(await t.run((ctx) => listCreatorSkills(ctx, creatorId))).toEqual([
      "typescript",
      "c-plus-plus",
    ]);
    expect(await t.run((ctx) => ctx.db.query("creatorSkills").take(10))).toHaveLength(3);
    await t.run((ctx) => updateCreatorSkills(ctx, creatorId, []));
    expect(await t.run((ctx) => listCreatorSkills(ctx, creatorId))).toEqual([]);
    expect(await t.run((ctx) => listCreatorSkills(ctx, otherId))).toEqual(["python"]);
  });

  test("does not apply the niche selection limit to skills", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "skills_many");
    const skills = ["react", "typescript", "python", "sql", "docker", "git"];
    await t.run((ctx) => updateCreatorSkills(ctx, creatorId, skills));
    expect(await t.run((ctx) => listCreatorSkills(ctx, creatorId))).toEqual(skills);
  });

  test("invalid replacement leaves the existing selection unchanged", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "skills_invalid");
    await t.run((ctx) => updateCreatorSkills(ctx, creatorId, ["python"]));
    const before = await t.run((ctx) => ctx.db.query("creatorSkills").take(10));
    await expectApiError(
      () => t.run((ctx) => updateCreatorSkills(ctx, creatorId, ["unknown"])),
      "invalid_state",
      "invalid_skill",
    );
    expect(await t.run((ctx) => ctx.db.query("creatorSkills").take(10))).toEqual(before);
  });
});
