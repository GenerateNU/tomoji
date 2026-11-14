/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { NICHES } from "../models/niches";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("niches.list", () => {
  test("returns options to a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "niche_creator" });
    expect(await asCreator.query(api.niches.list, {})).toEqual(NICHES);
  });

  test("returns options to a company user", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, { subject: "niche_company", org: { id: "org_acme" } });
    expect(await asCompany.query(api.niches.list, {})).toEqual(NICHES);
  });

  test("returns options to an operator", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "niche_operator");
    expect(await asOperator.query(api.niches.list, {})).toEqual(NICHES);
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(() => t.query(api.niches.list, {}), "not_authenticated");
  });

  test("searches display labels without changing stored names", async () => {
    const t = convexTest(schema, modules);
    const caller = await seedUser(t, { subject: "niche_search" });

    expect(await caller.query(api.niches.list, { search: " DATABASE MANAGEMENT " })).toEqual([
      { name: "databases", label: "Database Management" },
    ]);
  });
});
