/// <reference types="vite/client" />
import { WorkOS } from "@workos-inc/node";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { getCompanyByWorkosId } from "../models/companies";
import { recordInvite } from "../models/invites";
import schema from "../schema";
import { expectApiError, seedOperator, seedUser, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

// The SDK exports neither sub-client class, so the prototypes come from a
// throwaway instance. Spying there intercepts every client the routes build.
const client = new WorkOS("sk_test_tomoji");
const userManagement = Object.getPrototypeOf(client.userManagement);
const organizations = Object.getPrototypeOf(client.organizations);

function stubWorkos() {
  return {
    sendInvitation: vi
      .spyOn(userManagement, "sendInvitation")
      .mockResolvedValue({ id: "invitation_sent" } as never),
    revokeInvitation: vi
      .spyOn(userManagement, "revokeInvitation")
      .mockResolvedValue({ id: "invitation_revoked" } as never),
    createOrganization: vi
      .spyOn(organizations, "createOrganization")
      .mockResolvedValue({ id: "org_created" } as never),
  };
}

/** The errors WorkOS actually throws for a duplicate: a 400 carrying a code. */
function workosDuplicateError(code: "email_already_invited" | "user_already_exists") {
  const message =
    code === "email_already_invited" ? "Email already invited." : "User already exists.";
  return Object.assign(new Error(message), { status: 400, code, rawData: { message, code } });
}

let workos: ReturnType<typeof stubWorkos>;

beforeEach(() => {
  vi.stubEnv("WORKOS_API_KEY", "sk_test_tomoji");
  vi.stubEnv("WORKOS_OPERATOR_ORG_ID", "org_tomoji");
  workos = stubWorkos();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const EXPIRES_AT = Date.parse("2026-11-01T00:00:00Z");

async function seedCompany(t: TestConvex, orgId: string): Promise<Id<"companies">> {
  await seedUser(t, { subject: `member_${orgId}`, org: { id: orgId } });
  return await t.run(async (ctx) => {
    const company = await getCompanyByWorkosId(ctx, orgId);
    if (company === null) throw new Error(`expected seeded company ${orgId}`);
    return company._id;
  });
}

/** Records a pending invite the way the `invitation.created` webhook would. */
async function seedInvite(
  t: TestConvex,
  workosId: string,
  organizationId?: string,
): Promise<Doc<"invites">> {
  await t.run(
    async (ctx) =>
      await recordInvite(
        ctx,
        { workosId, email: `${workosId}@example.com`, organizationId, expiresAt: EXPIRES_AT },
        organizationId === "org_tomoji",
      ),
  );
  const invite = await t.run(
    async (ctx) =>
      await ctx.db
        .query("invites")
        .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
        .unique(),
  );
  if (invite === null) throw new Error(`expected seeded invite ${workosId}`);
  return invite;
}

describe("inviteCreator", () => {
  test("sends an invitation with no organization", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op1");

    await asOperator.action(api.invites.inviteCreator, { email: "creator@example.com" });

    expect(workos.sendInvitation).toHaveBeenCalledWith({
      email: "creator@example.com",
      organizationId: undefined,
      roleSlug: undefined,
      expiresInDays: 7,
    });
  });

  test("writes nothing itself: the webhook records the invite", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op2");

    await asOperator.action(api.invites.inviteCreator, { email: "creator@example.com" });

    expect(await t.run(async (ctx) => await ctx.db.query("invites").collect())).toEqual([]);
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator1" });

    await expectApiError(
      () => asCreator.action(api.invites.inviteCreator, { email: "x@example.com" }),
      "forbidden",
    );
    expect(workos.sendInvitation).not.toHaveBeenCalled();
  });

  test("rejects a company admin", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin1",
      org: { id: "org_acme", role: "admin" },
    });

    await expectApiError(
      () => asAdmin.action(api.invites.inviteCreator, { email: "x@example.com" }),
      "forbidden",
    );
  });

  test("rejects a blank email before calling WorkOS", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op3");

    await expectApiError(
      () => asOperator.action(api.invites.inviteCreator, { email: "   " }),
      "invalid_state",
    );
    expect(workos.sendInvitation).not.toHaveBeenCalled();
  });

  // WorkOS uses a different code once the person has accepted an earlier invite
  // and has a real account, and the operator needs to tell those apart.
  test("reports an email that already has an account as a conflict", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op18");
    workos.sendInvitation.mockRejectedValueOnce(workosDuplicateError("user_already_exists"));

    await expectApiError(
      () => asOperator.action(api.invites.inviteCreator, { email: "taken@example.com" }),
      "conflict",
      "already_registered",
    );
  });

  test("reports an already pending invitation as a conflict", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op4");
    workos.sendInvitation.mockRejectedValueOnce(workosDuplicateError("email_already_invited"));

    await expectApiError(
      () => asOperator.action(api.invites.inviteCreator, { email: "dupe@example.com" }),
      "conflict",
      "invite_already_pending",
    );
  });

  test("reports any other WorkOS failure as upstream_failure", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op5");
    workos.sendInvitation.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));

    await expectApiError(
      () => asOperator.action(api.invites.inviteCreator, { email: "x@example.com" }),
      "upstream_failure",
    );
  });

  test("fails loudly when the deployment has no WorkOS key", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op6");
    vi.stubEnv("WORKOS_API_KEY", "");

    await expectApiError(
      () => asOperator.action(api.invites.inviteCreator, { email: "x@example.com" }),
      "misconfigured",
      "workos_api_key_missing",
    );
  });
});

describe("inviteCompany", () => {
  test("creates the organization, the company row, and the first admin's invite", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op7");

    const companyId = await asOperator.action(api.invites.inviteCompany, {
      companyName: "Acme",
      email: "founder@acme.com",
    });

    expect(workos.createOrganization).toHaveBeenCalledWith({ name: "Acme" });
    expect(await t.run(async (ctx) => await ctx.db.get("companies", companyId))).toMatchObject({
      workosId: "org_created",
      name: "Acme",
      isActive: true,
    });
    expect(workos.sendInvitation).toHaveBeenCalledWith({
      email: "founder@acme.com",
      organizationId: "org_created",
      roleSlug: "admin",
      expiresInDays: 7,
    });
  });

  // The webhook needs the company row to attribute the invite, so it has to
  // be written before the invitation is sent.
  test("writes the company before sending the invitation", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op8");

    await asOperator.action(api.invites.inviteCompany, {
      companyName: "Acme",
      email: "founder@acme.com",
    });

    expect(workos.createOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      workos.sendInvitation.mock.invocationCallOrder[0],
    );
    expect(
      await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_created")),
    ).not.toBeNull();
  });

  // A naive retry would make a second organization and a second company, so
  // the failure has to hand back the one that already exists.
  test("reports the company it created when the invitation fails", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op17");
    workos.sendInvitation.mockRejectedValueOnce(workosDuplicateError("email_already_invited"));

    await expect(
      asOperator.action(api.invites.inviteCompany, {
        companyName: "Acme",
        email: "founder@acme.com",
      }),
    ).rejects.toMatchObject({
      data: { code: "conflict", reason: "invite_already_pending", companyCreated: true },
    });

    const company = await t.run(async (ctx) => await getCompanyByWorkosId(ctx, "org_created"));
    expect(company).not.toBeNull();
  });

  test("rejects a blank company name before creating anything", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op9");

    await expectApiError(
      () => asOperator.action(api.invites.inviteCompany, { companyName: " ", email: "a@b.com" }),
      "invalid_state",
    );
    expect(workos.createOrganization).not.toHaveBeenCalled();
  });

  test("rejects a company admin", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin2",
      org: { id: "org_acme", role: "admin" },
    });

    await expectApiError(
      () =>
        asAdmin.action(api.invites.inviteCompany, { companyName: "Rival", email: "a@rival.com" }),
      "forbidden",
    );
  });
});

describe("inviteCompanyUser", () => {
  test("invites into an existing company's organization", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op10");
    const companyId = await seedCompany(t, "org_acme");

    await asOperator.action(api.invites.inviteCompanyUser, {
      companyId,
      email: "new@acme.com",
      role: "admin",
    });

    expect(workos.sendInvitation).toHaveBeenCalledWith({
      email: "new@acme.com",
      organizationId: "org_acme",
      roleSlug: "admin",
      expiresInDays: 7,
    });
  });

  test("rejects a company that does not exist", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op11");
    const companyId = await seedCompany(t, "org_gone");
    await t.run(async (ctx) => await ctx.db.delete(companyId));

    await expectApiError(
      () =>
        asOperator.action(api.invites.inviteCompanyUser, {
          companyId,
          email: "a@b.com",
          role: "member",
        }),
      "not_found",
    );
    expect(workos.sendInvitation).not.toHaveBeenCalled();
  });
});

describe("inviteTeammate", () => {
  test("invites into the caller's own organization", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin3",
      org: { id: "org_acme", role: "admin" },
    });

    await asAdmin.action(api.invites.inviteTeammate, { email: "new@acme.com", role: "member" });

    expect(workos.sendInvitation).toHaveBeenCalledWith({
      email: "new@acme.com",
      organizationId: "org_acme",
      roleSlug: "member",
      expiresInDays: 7,
    });
  });

  test("rejects a company member", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, {
      subject: "mem1",
      org: { id: "org_acme", role: "member" },
    });

    await expectApiError(
      () => asMember.action(api.invites.inviteTeammate, { email: "x@acme.com", role: "member" }),
      "forbidden",
      "company_admin_required",
    );
    expect(workos.sendInvitation).not.toHaveBeenCalled();
  });

  test("rejects an operator, who has no company of their own", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op12");

    await expectApiError(
      () => asOperator.action(api.invites.inviteTeammate, { email: "x@acme.com", role: "member" }),
      "forbidden",
    );
  });
});

describe("listMine", () => {
  test("returns only the caller's company's invites", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin4",
      org: { id: "org_acme", role: "admin" },
    });
    await seedCompany(t, "org_other");
    await seedInvite(t, "i_acme", "org_acme");
    await seedInvite(t, "i_other", "org_other");

    const { page } = await asAdmin.query(api.invites.listMine, {
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(page.map((invite) => invite.workosId)).toEqual(["i_acme"]);
  });

  test("rejects a company member", async () => {
    const t = convexTest(schema, modules);
    const asMember = await seedUser(t, {
      subject: "mem2",
      org: { id: "org_acme", role: "member" },
    });

    await expectApiError(
      () =>
        asMember.query(api.invites.listMine, { paginationOpts: { cursor: null, numItems: 10 } }),
      "forbidden",
    );
  });
});

describe("list", () => {
  test("returns only invites of the requested kind", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op13");
    await seedCompany(t, "org_acme");
    await seedInvite(t, "i_creator");
    await seedInvite(t, "i_company", "org_acme");

    const { page } = await asOperator.query(api.invites.list, {
      kind: "creator",
      paginationOpts: { cursor: null, numItems: 10 },
    });

    expect(page.map((invite) => invite.workosId)).toEqual(["i_creator"]);
  });

  test("rejects a company admin", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin5",
      org: { id: "org_acme", role: "admin" },
    });

    await expectApiError(
      () =>
        asAdmin.query(api.invites.list, {
          kind: "creator",
          paginationOpts: { cursor: null, numItems: 10 },
        }),
      "forbidden",
    );
  });
});

describe("revokeMine", () => {
  test("revokes the caller's company's invite", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin6",
      org: { id: "org_acme", role: "admin" },
    });
    const invite = await seedInvite(t, "i_acme", "org_acme");

    await asAdmin.action(api.invites.revokeMine, { inviteId: invite._id });

    expect(workos.revokeInvitation).toHaveBeenCalledWith("i_acme");
  });

  // The row clears on `invitation.revoked`, not here, so a dropped webhook
  // leaves a stale row rather than a revoked invite that still looks pending.
  test("leaves the row for the webhook to clear", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin7",
      org: { id: "org_acme", role: "admin" },
    });
    const invite = await seedInvite(t, "i_acme", "org_acme");

    await asAdmin.action(api.invites.revokeMine, { inviteId: invite._id });

    expect(await t.run(async (ctx) => await ctx.db.get("invites", invite._id))).not.toBeNull();
  });

  test("rejects another company's invite", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await seedUser(t, {
      subject: "admin8",
      org: { id: "org_acme", role: "admin" },
    });
    await seedCompany(t, "org_other");
    const invite = await seedInvite(t, "i_other", "org_other");

    await expectApiError(
      () => asAdmin.action(api.invites.revokeMine, { inviteId: invite._id }),
      "not_found",
    );
    expect(workos.revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("revoke", () => {
  test("an operator revokes a creator invite", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op14");
    const invite = await seedInvite(t, "i_creator");

    await asOperator.action(api.invites.revoke, { inviteId: invite._id });

    expect(workos.revokeInvitation).toHaveBeenCalledWith("i_creator");
  });

  test("an operator revokes any company's invite", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op15");
    await seedCompany(t, "org_acme");
    const invite = await seedInvite(t, "i_acme", "org_acme");

    await asOperator.action(api.invites.revoke, { inviteId: invite._id });

    expect(workos.revokeInvitation).toHaveBeenCalledWith("i_acme");
  });

  test("rejects a creator", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "creator2" });
    const invite = await seedInvite(t, "i_creator");

    await expectApiError(
      () => asCreator.action(api.invites.revoke, { inviteId: invite._id }),
      "forbidden",
    );
  });

  test("reports a WorkOS revoke failure as upstream_failure", async () => {
    const t = convexTest(schema, modules);
    const asOperator = await seedOperator(t, "op16");
    const invite = await seedInvite(t, "i_creator");
    workos.revokeInvitation.mockRejectedValueOnce(new Error("boom"));

    await expectApiError(
      () => asOperator.action(api.invites.revoke, { inviteId: invite._id }),
      "upstream_failure",
      "workos_revoke_failed",
    );
  });
});
