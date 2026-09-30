/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  expectApiError,
  seedCreatorId,
  seedOpportunity,
  seedOperator,
  seedUser,
  seedWrongOrgCaller,
  workosIdentity,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const firstPage = { numItems: 10, cursor: null };

/** Seeds an opportunity and a creator client that has applied to it. */
async function seedApplication(t: TestConvex) {
  const seeded = await seedOpportunity(t);
  await seedCreatorId(t, "creator_a");
  const asCreator = t.withIdentity(workosIdentity({ subject: "creator_a" }));
  const applicationId = await asCreator.mutation(api.applications.create, {
    opportunityId: seeded.opportunityId,
    note: "I film daily.",
  });
  return { ...seeded, asCreator, applicationId };
}

describe("applications.create", () => {
  test("creates a pending application for the calling creator", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId, opportunityId } = await seedApplication(t);

    const application = await asCreator.query(api.applications.get, { applicationId });

    expect(application).toMatchObject({ opportunityId, note: "I film daily.", status: "pending" });
  });

  test("accepts an application without a note", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);
    const asCreator = await seedUser(t, { subject: "creator_a" });

    const applicationId = await asCreator.mutation(api.applications.create, { opportunityId });

    const application = await asCreator.query(api.applications.get, { applicationId });
    expect(application.status).toBe("pending");
    expect(application).not.toHaveProperty("note");
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { opportunityId } = await seedOpportunity(t);

    await expectApiError(
      () => t.mutation(api.applications.create, { opportunityId, note: "Hi" }),
      "not_authenticated",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, opportunityId } = await seedOpportunity(t);

    await expectApiError(
      () => asCompany.mutation(api.applications.create, { opportunityId, note: "Hi" }),
      "forbidden",
    );
  });
});

describe("applications.listMine", () => {
  test("lists only the calling creator's applications", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, applicationId, opportunityId } = await seedApplication(t);
    const asOther = await seedUser(t, { subject: "creator_b" });
    await asOther.mutation(api.applications.create, { opportunityId, note: "Me too." });

    const result = await asCreator.query(api.applications.listMine, { paginationOpts: firstPage });

    expect(result.page.map((application) => application._id)).toEqual([applicationId]);
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { asCompany } = await seedOpportunity(t);

    await expectApiError(
      () => asCompany.query(api.applications.listMine, { paginationOpts: firstPage }),
      "forbidden",
    );
  });
});

describe("applications.get", () => {
  test("returns the application to the owning company's members", async () => {
    const t = convexTest(schema, modules);
    const { asCompany, applicationId } = await seedApplication(t);
    const asTeammate = await seedUser(t, { subject: "teammate", org: { id: "org_acme" } });

    expect(await asCompany.query(api.applications.get, { applicationId })).toMatchObject({
      _id: applicationId,
    });
    expect(await asTeammate.query(api.applications.get, { applicationId })).toMatchObject({
      _id: applicationId,
    });
  });

  test("returns the application to an operator", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asOperator = await seedOperator(t, "operator");

    expect(await asOperator.query(api.applications.get, { applicationId })).toMatchObject({
      _id: applicationId,
    });
  });

  test("hides the application from other creators and companies", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asOtherCreator = await seedUser(t, { subject: "creator_b" });
    const { asCompany: asOtherCompany } = await seedOpportunity(t, {
      subject: "other_owner",
      orgId: "org_other",
    });

    await expectApiError(
      () => asOtherCreator.query(api.applications.get, { applicationId }),
      "not_found",
    );
    await expectApiError(
      () => asOtherCompany.query(api.applications.get, { applicationId }),
      "not_found",
    );
  });

  test("rejects a caller acting on an org they are not a member of", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);
    const asWrongOrg = await seedWrongOrgCaller(t);

    await expectApiError(
      () => asWrongOrg.query(api.applications.get, { applicationId }),
      "forbidden",
    );
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { applicationId } = await seedApplication(t);

    await expectApiError(
      () => t.query(api.applications.get, { applicationId }),
      "not_authenticated",
    );
  });
});
