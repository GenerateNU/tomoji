/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { expectApiError, seedUser } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("countries.list", () => {
  test("returns every country sorted by name", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "country_reader" });

    const countries = await asCreator.query(api.countries.list, {});

    expect(countries.length).toBeGreaterThan(200);
    expect(countries).toContainEqual({ code: "ID", name: "Indonesia" });
    expect(countries.map((entry) => entry.name)).toEqual(
      [...countries.map((entry) => entry.name)].sort((a, b) => a.localeCompare(b)),
    );
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => t.query(api.countries.list, {}), "not_authenticated");
  });
});
