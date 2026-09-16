/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { DAY_MS, seedCampaign, seedCompanyAndCreator } from "./testing.helpers";

const modules = import.meta.glob("./**/*.ts");

describe("companyActiveCampaigns", () => {
  test("returns the company's available campaigns end-to-end", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, Date.now(), {
      title: "Summer launch",
      status: "open",
      deadline: Date.now() + DAY_MS,
    });

    const result = await t.query(api.campaigns.companyActiveCampaigns, { companyId });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Summer launch");
  });

  test("exposes the public fields and withholds the internal ones", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, Date.now(), {
      title: "Public shape check",
      status: "open",
      deadline: Date.now() + DAY_MS,
      prohibitedClaims: ["no medical claims"],
      talkingPoints: ["mention the launch"],
      disclosureRequirements: ["#ad"],
      usageRights: "6 months paid social",
    });

    const result = await t.query(api.campaigns.companyActiveCampaigns, { companyId });

    expect(result).toHaveLength(1);
    const campaign = result[0] as Record<string, unknown>;
    expect(campaign).not.toHaveProperty("createdBy");
    expect(campaign).not.toHaveProperty("maxApplications");
    expect(campaign).not.toHaveProperty("status");
    expect(campaign.prohibitedClaims).toEqual(["no medical claims"]);
    expect(campaign.talkingPoints).toEqual(["mention the launch"]);
    expect(campaign.disclosureRequirements).toEqual(["#ad"]);
    expect(campaign.usageRights).toBe("6 months paid social");
    expect(campaign.title).toBe("Public shape check");
    expect(campaign.deadline).toEqual(expect.any(Number));
  });

  // Every optional field is declared `v.optional`, so an unset field is
  // omitted from the response entirely rather than sent as null.
  test("omits the optional fields when the campaign has none set", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, Date.now(), { status: "open" });

    const result = await t.query(api.campaigns.companyActiveCampaigns, { companyId });

    expect(result).toHaveLength(1);
    const campaign = result[0] as Record<string, unknown>;
    expect(campaign).not.toHaveProperty("audience");
    expect(campaign).not.toHaveProperty("talkingPoints");
    expect(campaign).not.toHaveProperty("prohibitedClaims");
    expect(campaign).not.toHaveProperty("disclosureRequirements");
    expect(campaign).not.toHaveProperty("usageRights");
  });

  test("passes audience through unchanged when it is set", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, Date.now(), {
      title: "Has audience",
      status: "open",
      deadline: Date.now() + DAY_MS,
      audience: "Gen Z gamers",
    });

    const result = await t.query(api.campaigns.companyActiveCampaigns, { companyId });

    expect(result).toHaveLength(1);
    expect(result[0].audience).toBe("Gen Z gamers");
  });
});

describe("addCampaign", () => {
  function validArgs(companyId: Id<"companies">, createdBy: Id<"companyUsers">) {
    return {
      companyId,
      createdBy,
      title: "Summer launch",
      description: "A campaign description",
      format: "video" as const,
      status: "open" as const,
      isVetted: false,
      maxApplications: 10,
      maxOpenings: 3,
      deadline: Date.now() + DAY_MS,
    };
  }

  test("creates a campaign and returns a usable id", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    const campaignId = await t.mutation(api.campaigns.addCampaign, validArgs(companyId, createdBy));

    const stored = await t.run(async (ctx) => ctx.db.get(campaignId));
    expect(stored).toMatchObject({
      companyId,
      createdBy,
      title: "Summer launch",
      description: "A campaign description",
      format: "video",
      status: "open",
      isVetted: false,
      maxApplications: 10,
      maxOpenings: 3,
    });
  });

  test("stores createdBy exactly as supplied", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    const campaignId = await t.mutation(api.campaigns.addCampaign, validArgs(companyId, createdBy));

    const stored = await t.run(async (ctx) => ctx.db.get(campaignId));
    expect(stored?.createdBy).toBe(createdBy);
  });

  test("persists the optional brief fields when supplied", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    const campaignId = await t.mutation(api.campaigns.addCampaign, {
      ...validArgs(companyId, createdBy),
      audience: "Gen Z gamers",
      talkingPoints: ["Point one", "Point two"],
      prohibitedClaims: ["Cures cancer"],
      disclosureRequirements: ["#ad"],
      usageRights: "90 days paid media",
    });

    const stored = await t.run(async (ctx) => ctx.db.get(campaignId));
    expect(stored?.audience).toBe("Gen Z gamers");
    expect(stored?.talkingPoints).toEqual(["Point one", "Point two"]);
    expect(stored?.prohibitedClaims).toEqual(["Cures cancer"]);
    expect(stored?.disclosureRequirements).toEqual(["#ad"]);
    expect(stored?.usageRights).toBe("90 days paid media");
  });

  test("leaves optional fields absent when omitted", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    const campaignId = await t.mutation(api.campaigns.addCampaign, validArgs(companyId, createdBy));

    const stored = await t.run(async (ctx) => ctx.db.get(campaignId));
    expect(stored).not.toHaveProperty("audience");
    expect(stored).not.toHaveProperty("talkingPoints");
    expect(stored).not.toHaveProperty("prohibitedClaims");
    expect(stored).not.toHaveProperty("disclosureRequirements");
    expect(stored).not.toHaveProperty("usageRights");
  });

  test("a campaign created with status open and a future deadline is returned by companyActiveCampaigns", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    await t.mutation(api.campaigns.addCampaign, {
      ...validArgs(companyId, createdBy),
      title: "Open and upcoming",
      status: "open",
      deadline: Date.now() + DAY_MS,
    });

    const result = await t.query(api.campaigns.companyActiveCampaigns, { companyId });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Open and upcoming");
  });

  test("a campaign created with status draft is not returned by companyActiveCampaigns", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    await t.mutation(api.campaigns.addCampaign, {
      ...validArgs(companyId, createdBy),
      title: "Still a draft",
      status: "draft",
    });

    const result = await t.query(api.campaigns.companyActiveCampaigns, { companyId });

    expect(result).toEqual([]);
  });

  // KNOWN GAP: createCampaign has no auth or authorization yet, so any
  // caller can create a campaign for any company. This test pins today's
  // actual behavior and must be INVERTED (to expect a rejection) once
  // authorization is implemented.
  test("currently allows an unauthenticated caller to create a campaign (auth is not implemented yet)", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    await expect(
      t.mutation(api.campaigns.addCampaign, validArgs(companyId, createdBy)),
    ).resolves.not.toThrow();
  });

  test("rejects an invalid status value", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);

    await expect(
      t.mutation(api.campaigns.addCampaign, {
        ...validArgs(companyId, createdBy),
        status: "archived" as never,
      }),
    ).rejects.toThrow();
  });
});
