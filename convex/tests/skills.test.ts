/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { SKILLS } from "../models/skills";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("skills.list", () => {
  test("returns options to a creator", async () => {
    const t = convexTest(schema, modules);
    const caller = await seedUser(t, { subject: "skills_creator" });
    expect(await caller.query(api.skills.list, {})).toEqual(SKILLS);
  });

  test("returns options to a company user", async () => {
    const t = convexTest(schema, modules);
    const caller = await seedUser(t, { subject: "skills_company", org: { id: "skills_org" } });
    expect(await caller.query(api.skills.list, {})).toEqual(SKILLS);
  });

  test("returns options to an operator", async () => {
    const t = convexTest(schema, modules);
    const caller = await seedOperator(t, "skills_operator");
    expect(await caller.query(api.skills.list, {})).toEqual(SKILLS);
  });

  test("filters options by their display label", async () => {
    const t = convexTest(schema, modules);
    const caller = await seedUser(t, { subject: "skills_search" });
    expect(await caller.query(api.skills.list, { search: " c++ " })).toEqual([
      { name: "c-plus-plus", label: "C++" },
    ]);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(() => t.query(api.skills.list, {}), "not_authenticated");
  });
});
