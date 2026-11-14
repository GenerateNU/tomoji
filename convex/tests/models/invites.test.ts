/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { getCompanyByWorkosId } from "../../models/companies";
import {
  closeInvite,
  invitationFrom,
  listCompanyInvites,
  listInvitesByKind,
  recordInvite,
  refreshInvite,
  requireRevocableInvite,
  type InviteEvent,
} from "../../models/invites";
import schema from "../../schema";
import { expectApiError, seedUser, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const EXPIRES_AT = Date.parse("2026-11-01T00:00:00Z");

function inviteEvent(overrides: Partial<InviteEvent> = {}): InviteEvent {
  return {
    workosId: "invitation_1",
    email: "new@acme.com",
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

async function record(t: TestConvex, event: InviteEvent, isOperatorOrg = false) {
  await t.run(async (ctx) => await recordInvite(ctx, event, isOperatorOrg));
}

async function storedInvites(t: TestConvex): Promise<Doc<"invites">[]> {
  return await t.run(async (ctx) => await ctx.db.query("invites").collect());
}

async function seedCompany(t: TestConvex, orgId: string): Promise<Id<"companies">> {
  await seedUser(t, { subject: `member_${orgId}`, org: { id: orgId } });
  return await t.run(async (ctx) => {
    const company = await getCompanyByWorkosId(ctx, orgId);
    if (company === null) throw new Error(`expected seeded company ${orgId}`);
    return company._id;
  });
}

describe("recordInvite", () => {
  test("an invite with no organization is a creator invite", async () => {
    const t = convexTest(schema, modules);

    await record(t, inviteEvent());

    expect(await storedInvites(t)).toMatchObject([
      { workosId: "invitation_1", email: "new@acme.com", kind: "creator", expiresAt: EXPIRES_AT },
    ]);
  });

  test("a creator invite carries no company or role", async () => {
    const t = convexTest(schema, modules);

    await record(t, inviteEvent());

    const [invite] = await storedInvites(t);
    expect(invite.companyId).toBeUndefined();
    expect(invite.role).toBeUndefined();
  });

  test("an invite into the operator org is an operator invite", async () => {
    const t = convexTest(schema, modules);

    await record(t, inviteEvent({ organizationId: "org_tomoji", roleSlug: "admin" }), true);

    const [invite] = await storedInvites(t);
    expect(invite.kind).toBe("operator");
    expect(invite.companyId).toBeUndefined();
  });

  test("an invite into a known company records the company and role", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "org_acme");

    await record(t, inviteEvent({ organizationId: "org_acme", roleSlug: "admin" }));

    expect(await storedInvites(t)).toMatchObject([
      { kind: "companyUser", companyId, role: "admin" },
    ]);
  });

  test("any role slug that is not admin becomes a member", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t, "org_acme");

    await record(t, inviteEvent({ organizationId: "org_acme", roleSlug: "something_else" }));

    expect(await storedInvites(t)).toMatchObject([{ role: "member" }]);
  });

  test("an invite with no role slug becomes a member", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t, "org_acme");

    await record(t, inviteEvent({ organizationId: "org_acme" }));

    expect(await storedInvites(t)).toMatchObject([{ role: "member" }]);
  });

  // The company row appears when its first member accepts, so guessing one
  // here would attribute the invite to the wrong company.
  test("an invite into an organization we have never seen is ignored", async () => {
    const t = convexTest(schema, modules);

    await record(t, inviteEvent({ organizationId: "org_unknown" }));

    expect(await storedInvites(t)).toEqual([]);
  });

  test("a redelivered webhook does not write a second row", async () => {
    const t = convexTest(schema, modules);

    await record(t, inviteEvent());
    await record(t, inviteEvent({ email: "changed@acme.com" }));

    expect(await storedInvites(t)).toMatchObject([{ email: "new@acme.com" }]);
  });
});

describe("closeInvite", () => {
  test("drops the row once the invitation is accepted or revoked", async () => {
    const t = convexTest(schema, modules);
    await record(t, inviteEvent());

    await t.run(async (ctx) => await closeInvite(ctx, "invitation_1"));

    expect(await storedInvites(t)).toEqual([]);
  });

  test("ignores an invitation we never recorded", async () => {
    const t = convexTest(schema, modules);
    await record(t, inviteEvent());

    await t.run(async (ctx) => await closeInvite(ctx, "invitation_unknown"));

    expect(await storedInvites(t)).toHaveLength(1);
  });
});

describe("refreshInvite", () => {
  test("pushes the expiry out after a resend", async () => {
    const t = convexTest(schema, modules);
    await record(t, inviteEvent());
    const later = EXPIRES_AT + 7 * 24 * 60 * 60 * 1000;

    await t.run(async (ctx) => await refreshInvite(ctx, inviteEvent({ expiresAt: later })));

    expect(await storedInvites(t)).toMatchObject([{ expiresAt: later }]);
  });

  test("ignores a resend for an invitation we never recorded", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => await refreshInvite(ctx, inviteEvent()));

    expect(await storedInvites(t)).toEqual([]);
  });
});

describe("listCompanyInvites", () => {
  test("returns only that company's invites, newest first", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "org_acme");
    await seedCompany(t, "org_other");
    await record(
      t,
      inviteEvent({ workosId: "i1", email: "first@acme.com", organizationId: "org_acme" }),
    );
    await record(
      t,
      inviteEvent({ workosId: "i2", email: "second@acme.com", organizationId: "org_acme" }),
    );
    await record(
      t,
      inviteEvent({ workosId: "i3", email: "x@other.com", organizationId: "org_other" }),
    );

    const { page } = await t.run(
      async (ctx) => await listCompanyInvites(ctx, companyId, { cursor: null, numItems: 10 }),
    );

    expect(page.map((invite) => invite.email)).toEqual(["second@acme.com", "first@acme.com"]);
  });

  test("pages through every invite", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "org_acme");
    for (const n of [1, 2, 3]) {
      await record(t, inviteEvent({ workosId: `i${n}`, organizationId: "org_acme" }));
    }

    const first = await t.run(
      async (ctx) => await listCompanyInvites(ctx, companyId, { cursor: null, numItems: 2 }),
    );
    const second = await t.run(
      async (ctx) =>
        await listCompanyInvites(ctx, companyId, { cursor: first.continueCursor, numItems: 2 }),
    );

    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);
  });
});

describe("listInvitesByKind", () => {
  test("returns only invites of that kind", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t, "org_acme");
    await record(t, inviteEvent({ workosId: "i1", email: "creator@example.com" }));
    await record(
      t,
      inviteEvent({ workosId: "i2", email: "staff@tomoji.com", organizationId: "org_tomoji" }),
      true,
    );
    await record(
      t,
      inviteEvent({ workosId: "i3", email: "member@acme.com", organizationId: "org_acme" }),
    );

    const { page } = await t.run(
      async (ctx) => await listInvitesByKind(ctx, "creator", { cursor: null, numItems: 10 }),
    );

    expect(page.map((invite) => invite.email)).toEqual(["creator@example.com"]);
  });
});

describe("requireRevocableInvite", () => {
  test("an operator may revoke any invite", async () => {
    const t = convexTest(schema, modules);
    await record(t, inviteEvent());
    const [invite] = await storedInvites(t);

    const found = await t.run(async (ctx) => await requireRevocableInvite(ctx, invite._id, null));

    expect(found.workosId).toBe("invitation_1");
  });

  test("a company admin may revoke their own company's invite", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "org_acme");
    await record(t, inviteEvent({ organizationId: "org_acme" }));
    const [invite] = await storedInvites(t);

    const found = await t.run(
      async (ctx) => await requireRevocableInvite(ctx, invite._id, companyId),
    );

    expect(found._id).toBe(invite._id);
  });

  test("a company admin cannot revoke another company's invite", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t, "org_acme");
    const otherCompanyId = await seedCompany(t, "org_other");
    await record(t, inviteEvent({ organizationId: "org_acme" }));
    const [invite] = await storedInvites(t);

    await expectApiError(
      () => t.run(async (ctx) => await requireRevocableInvite(ctx, invite._id, otherCompanyId)),
      "not_found",
    );
  });

  // A creator invite has no company, so it must not fall through to a
  // company admin's scope check.
  test("a company admin cannot revoke a creator invite", async () => {
    const t = convexTest(schema, modules);
    const companyId = await seedCompany(t, "org_acme");
    await record(t, inviteEvent());
    const [invite] = await storedInvites(t);

    await expectApiError(
      () => t.run(async (ctx) => await requireRevocableInvite(ctx, invite._id, companyId)),
      "not_found",
    );
  });
});

describe("invitationFrom", () => {
  const payload = {
    id: "invitation_1",
    email: "new@acme.com",
    organizationId: "org_acme",
    roleSlug: "admin",
    expiresAt: "2026-11-01T00:00:00.000Z",
  };

  test("parses the ISO expiry into a timestamp", () => {
    expect(invitationFrom(payload).expiresAt).toBe(Date.parse("2026-11-01T00:00:00.000Z"));
  });

  test("keeps the organization and role a company invite carries", () => {
    expect(invitationFrom(payload)).toMatchObject({
      workosId: "invitation_1",
      email: "new@acme.com",
      organizationId: "org_acme",
      roleSlug: "admin",
    });
  });

  // A creator invite arrives with explicit nulls, which recordInvite reads
  // as "no organization" rather than "an organization we have not synced".
  test("turns the nulls on a creator invite into undefined", () => {
    const invite = invitationFrom({ ...payload, organizationId: null, roleSlug: null });

    expect(invite.organizationId).toBeUndefined();
    expect(invite.roleSlug).toBeUndefined();
  });

  test("rejects an expiry it cannot parse rather than storing NaN", () => {
    expect(() => invitationFrom({ ...payload, expiresAt: "whenever" })).toThrow(
      /unparseable_invite_expiry/,
    );
  });
});
