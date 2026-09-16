/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "../schema";
import { getAllActiveCompanyCampaigns } from "./campaigns";
import {
  DAY_MS,
  seedCampaign,
  seedCompanyAndCreator,
  setCampaignDeadline,
} from "../testing.helpers";

const modules = import.meta.glob("../**/*.ts");

const NOW = 1_700_000_000_000;

// insertCompanyCampaign rejects any deadline that has already passed (measured
// against the real clock), so pin the clock to NOW for every test in this
// file. That keeps the pinned NOW constant meaningful for both seeding
// (through the production model function) and querying.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getAllActiveCompanyCampaigns", () => {
  test("returns open campaigns whose deadline is after now, for the requested company", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, NOW, {
      title: "Summer launch",
      status: "open",
      deadline: NOW + DAY_MS,
    });

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Summer launch");
  });

  test("excludes draft and closed campaigns", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, NOW, { title: "Draft one", status: "draft" });
    await seedCampaign(t, companyId, createdBy, NOW, { title: "Closed one", status: "closed" });

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toEqual([]);
  });

  test("excludes a campaign whose deadline is before now", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    const campaignId = await seedCampaign(t, companyId, createdBy, NOW, {
      title: "Expired campaign",
      status: "open",
      deadline: NOW + DAY_MS,
    });
    await setCampaignDeadline(t, campaignId, NOW - DAY_MS);

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toEqual([]);
  });

  test("excludes a campaign whose deadline equals now, but includes one at now + 1", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    // A deadline of exactly NOW cannot be seeded — insertCompanyCampaign
    // requires the deadline to be strictly in the future — so seed it valid
    // and move it onto the cutoff.
    const atCutoff = await seedCampaign(t, companyId, createdBy, NOW, {
      title: "Deadline exactly now",
      status: "open",
      deadline: NOW + DAY_MS,
    });
    await setCampaignDeadline(t, atCutoff, NOW);
    await seedCampaign(t, companyId, createdBy, NOW, {
      title: "Deadline one ms after now",
      status: "open",
      deadline: NOW + 1,
    });

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Deadline one ms after now");
  });

  test("excludes campaigns belonging to a different company", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await seedCompanyAndCreator(t);
    const other = await seedCompanyAndCreator(t);
    await seedCampaign(t, other.companyId, other.createdBy, NOW, {
      title: "Someone else's campaign",
      status: "open",
      deadline: NOW + DAY_MS,
    });

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toEqual([]);
  });

  test("returns an empty array when the company has no qualifying campaigns", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await seedCompanyAndCreator(t);

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toEqual([]);
  });

  test("returns full campaign documents, including fields the public endpoint hides", async () => {
    const t = convexTest(schema, modules);
    const { companyId, createdBy } = await seedCompanyAndCreator(t);
    await seedCampaign(t, companyId, createdBy, NOW, {
      title: "Full document check",
      status: "open",
      deadline: NOW + DAY_MS,
      maxApplications: 42,
    });

    const result = await t.run(async (ctx) => getAllActiveCompanyCampaigns(ctx, companyId, NOW));

    expect(result).toHaveLength(1);
    const campaign = result[0];
    expect(campaign.createdBy).toBe(createdBy);
    expect(campaign.maxApplications).toBe(42);
    expect(campaign.status).toBe("open");
  });
});
