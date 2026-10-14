/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { NICHES } from "../models/niches";
import schema from "../schema";
import { expectApiError, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("niches.list", () => {
  test("returns the niche list to creators and company users", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "niche_creator" });
    const asCompany = await seedUser(t, { subject: "niche_company", org: { id: "org_acme" } });

    for (const caller of [asCreator, asCompany]) {
      expect(await caller.query(api.niches.list, {})).toEqual(NICHES);
    }
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expectApiError(() => t.query(api.niches.list, {}), "not_authenticated");
  });
});
