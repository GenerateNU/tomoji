/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { listCreatorLanguages, updateCreatorLanguages } from "../../models/creatorLanguages";
import { LANGUAGES, MAX_LANGUAGES } from "../../models/languages";
import schema from "../../schema";
import { expectApiError, seedCreatorId } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

describe("updateCreatorLanguages", () => {
  test("replaces selections in input order without duplicates or affecting another creator", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "languages_owner");
    const otherId = await seedCreatorId(t, "languages_other");
    await t.run(async (ctx) => {
      await updateCreatorLanguages(ctx, otherId, ["french"]);
      await updateCreatorLanguages(ctx, creatorId, ["english"]);
      await updateCreatorLanguages(ctx, creatorId, ["Spanish", "spanish", "English"]);
    });

    expect(await t.run((ctx) => listCreatorLanguages(ctx, creatorId))).toEqual([
      "spanish",
      "english",
    ]);
    expect(await t.run((ctx) => listCreatorLanguages(ctx, otherId))).toEqual(["french"]);
  });

  test("an empty selection clears every row", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "languages_clear");
    await t.run((ctx) => updateCreatorLanguages(ctx, creatorId, ["japanese"]));

    await t.run((ctx) => updateCreatorLanguages(ctx, creatorId, []));

    expect(await t.run((ctx) => ctx.db.query("creatorLanguages").take(10))).toEqual([]);
  });

  test("an unknown language leaves the existing selection unchanged", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "languages_invalid");
    await t.run((ctx) => updateCreatorLanguages(ctx, creatorId, ["korean"]));

    await expectApiError(
      () => t.run((ctx) => updateCreatorLanguages(ctx, creatorId, ["klingon"])),
      "invalid_state",
      "invalid_language",
    );

    expect(await t.run((ctx) => listCreatorLanguages(ctx, creatorId))).toEqual(["korean"]);
  });

  test("rejects more languages than the shared maximum", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "languages_too_many");

    await expectApiError(
      () =>
        t.run((ctx) =>
          updateCreatorLanguages(
            ctx,
            creatorId,
            LANGUAGES.slice(0, MAX_LANGUAGES + 1).map((option) => option.name),
          ),
        ),
      "invalid_state",
      "too_many_languages",
    );

    expect(await t.run((ctx) => ctx.db.query("creatorLanguages").take(10))).toEqual([]);
  });
});
