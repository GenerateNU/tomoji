/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { canViewResource } from "../../lib/authz";
import schema from "../../schema";
import { seedAssignmentFixture, seedCreatorId, seedMembership } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

test("a creator scope matches only its own resources", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const otherCreatorId = await seedCreatorId(t, "scope_other_creator");
  const resource = { creatorId: fixture.creatorId, companyId: fixture.membership.companyId };
  expect(canViewResource({ role: "creator", creatorId: fixture.creatorId }, resource)).toBe(true);
  expect(canViewResource({ role: "creator", creatorId: otherCreatorId }, resource)).toBe(false);
});

test("a company scope matches only its own resources", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const other = await seedMembership(t, "scope_other_company");
  const resource = { creatorId: fixture.creatorId, companyId: fixture.membership.companyId };
  expect(
    canViewResource({ role: "company", companyId: fixture.membership.companyId }, resource),
  ).toBe(true);
  expect(
    canViewResource({ role: "company", companyId: other.membership.companyId }, resource),
  ).toBe(false);
});

test("an operator scope can view any creator-company resource", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  expect(
    canViewResource(
      { role: "operator" },
      {
        creatorId: fixture.creatorId,
        companyId: fixture.membership.companyId,
      },
    ),
  ).toBe(true);
});
