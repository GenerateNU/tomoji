/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import { getCompanyByWorkosId } from "../../models/companies";
import { getCompanyUserByUserId } from "../../models/companyUsers";
import { getCreatorByUserId } from "../../models/creators";
import {
  applyMembership,
  getUserByWorkosId,
  deactivateUser,
  removeMembership,
  requireCallerCreatorId,
  requireRole,
  requireUser,
  setUserActive,
  syncMembership,
  upsertUser,
} from "../../models/users";
import schema from "../../schema";
import {
  expectApiError,
  requireSeededUser,
  seedCreatorId,
  seedOpportunity,
  seedAssignment,
  seedProfilePictureUpload,
  seedUser,
  seedXAccount,
  workosIdentity,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

function joinOrg(workosUserId: string, organizationId = "org_acme") {
  return {
    workosUserId,
    organizationId,
    organizationName: "Acme",
    role: "admin" as const,
  };
}

/** Reads the creators row for a seeded user, or null when none exists. */
async function readCreatorRow(t: TestConvex, subject: string): Promise<Doc<"creators"> | null> {
  return await t.run(async (ctx) => {
    const user = await requireSeededUserInCtx(ctx, subject);
    return await getCreatorByUserId(ctx, user._id);
  });
}

async function requireSeededUserInCtx(
  ctx: Parameters<typeof getUserByWorkosId>[0],
  subject: string,
) {
  const user = await getUserByWorkosId(ctx, subject);
  if (user === null) throw new Error("expected seeded user");
  return user;
}

/** Seeds a company user whose WorkOS membership is then removed, leaving `left_company`. */
async function seedLeftCompanyUser(t: TestConvex, subject: string, orgId = "org_acme") {
  await seedUser(t, { subject, org: { id: orgId } });
  await t.run(async (ctx) => {
    await removeMembership(ctx, {
      workosUserId: subject,
      organizationId: orgId,
    });
  });
}

describe("upsertUser", () => {
  test("preserves the S3 picture reference when WorkOS updates the user", async () => {
    const t = convexTest(schema, modules);
    const { uploadId } = await seedProfilePictureUpload(t, "picture_owner", "complete");
    const userId = await t.run(async (ctx) =>
      upsertUser(ctx, { workosId: "picture_owner", email: "updated@example.com" }),
    );

    const user = await t.run(async (ctx) => ctx.db.get("users", userId));
    expect(user).toMatchObject({ email: "updated@example.com", profilePictureMediaId: uploadId });
    expect(user).not.toHaveProperty("profilePicture");
  });

  test.each([undefined, null, "", "   ", "\t\n"])(
    "falls back to email and an empty last name when firstName is %j",
    async (firstName) => {
      const t = convexTest(schema, modules);

      const userId = await t.run(async (ctx) =>
        upsertUser(ctx, {
          workosId: "missing_first_name",
          email: "fallback@example.com",
          firstName,
        }),
      );

      expect(await t.run(async (ctx) => ctx.db.get("users", userId))).toMatchObject({
        firstName: "fallback@example.com",
        lastName: "",
        email: "fallback@example.com",
      });
      expect(await t.run(async (ctx) => ctx.db.query("creators").take(1))).toMatchObject([
        { userId },
      ]);
    },
  );

  test.each([null, "", "   ", "\t\n"])(
    "uses the current email when firstName is explicitly cleared to %j",
    async (firstName) => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) =>
        upsertUser(ctx, {
          workosId: "existing_first_name",
          email: "original@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        }),
      );
      const updatedId = await t.run(async (ctx) =>
        upsertUser(ctx, {
          workosId: "existing_first_name",
          email: "updated@example.com",
          firstName,
          lastName: null,
        }),
      );

      expect(updatedId).toBe(userId);
      expect(await t.run(async (ctx) => ctx.db.get("users", userId))).toMatchObject({
        firstName: "updated@example.com",
        lastName: "",
        email: "updated@example.com",
      });
    },
  );

  test("preserves existing name parts when an update omits them", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      upsertUser(ctx, {
        workosId: "preserved_first_name",
        email: "original@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      }),
    );

    await t.run(async (ctx) =>
      upsertUser(ctx, {
        workosId: "preserved_first_name",
        email: "updated@example.com",
      }),
    );

    expect(await t.run(async (ctx) => ctx.db.get("users", userId))).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "updated@example.com",
    });
  });

  test("accepts an empty lastName with a nonblank firstName", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      upsertUser(ctx, {
        workosId: "single_name",
        email: "single@example.com",
        firstName: "Cher",
        lastName: "",
      }),
    );

    expect(await t.run(async (ctx) => ctx.db.get("users", userId))).toMatchObject({
      firstName: "Cher",
      lastName: "",
    });
  });

  test("creates a creator with a profile row and no generated username", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u1", firstName: "Ada", lastName: "Lovelace" });

    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      creators: (await ctx.db.query("creators").collect()).length,
    }));
    expect(counts).toEqual({ users: 1, creators: 1 });
    expect(await t.run(async (ctx) => getUserByWorkosId(ctx, "u1"))).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
    });
    const creator = await t.run(async (ctx) => await ctx.db.query("creators").unique());
    expect(creator).not.toHaveProperty("username");
  });

  test("is idempotent", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u2", firstName: "Grace", lastName: "Hopper" });
    await seedUser(t, { subject: "u2", firstName: "Grace", lastName: "Hopper" });

    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ firstName: "Grace", lastName: "Hopper" });
  });

  test("syncs separate name parts and preserves a chosen creator username", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const userId = await upsertUser(ctx, {
        workosId: "named_creator",
        email: "original@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      });
      const before = await ctx.db
        .query("creators")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (before === null) throw new Error("expected seeded creator");
      await ctx.db.patch("creators", before._id, { username: "ada" });
      await upsertUser(ctx, {
        workosId: "named_creator",
        email: "updated@example.com",
        firstName: "Augusta Ada",
      });
      const after = await ctx.db
        .query("creators")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      return { user: await ctx.db.get("users", userId), before, after };
    });

    expect(result.user).toMatchObject({ firstName: "Augusta Ada", lastName: "Lovelace" });
    expect(result.before).not.toHaveProperty("username");
    expect(result.after?.username).toBe("ada");
  });

  test("does not overwrite a promotion to operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u4" });
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "u4");
      await ctx.db.patch("users", user!._id, { role: "operator" });
      await upsertUser(ctx, { workosId: "u4", email: "u4@example.com" });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u4"));
    expect(user?.role).toBe("operator");
  });

  test("does not reactivate an account an operator deactivated", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u5" });
    await t.run(async (ctx) => {
      await deactivateUser(ctx, "u5");
      await upsertUser(ctx, { workosId: "u5", email: "u5@example.com" });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u5"));
    expect(user?.isActive).toBe(false);
  });

  test("stores the email trimmed and lowercased", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "normalized",
      email: "  Ada.Lovelace@Example.COM \t",
    });

    expect(await requireSeededUser(t, "normalized")).toMatchObject({
      email: "ada.lovelace@example.com",
      isActive: true,
    });
  });

  test("locks a second account with the same email, ignoring case, and leaves the first untouched", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "first_owner", email: "shared@example.com" });
    const original = await requireSeededUser(t, "first_owner");

    await seedUser(t, {
      subject: "second_claimant",
      email: "Shared@Example.com",
    });

    const duplicate = await requireSeededUser(t, "second_claimant");
    expect(duplicate).toMatchObject({
      email: "shared@example.com",
      role: "creator",
      isActive: false,
      deactivatedReason: "duplicate_email",
    });
    expect(await readCreatorRow(t, "second_claimant")).toBeNull();
    expect(await requireSeededUser(t, "first_owner")).toEqual(original);
    expect(await readCreatorRow(t, "first_owner")).not.toBeNull();
  });

  test("logs the user IDs but never the email when it locks a duplicate", async () => {
    const t = convexTest(schema, modules);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "log_owner", email: "private@example.com" });
    await seedUser(t, {
      subject: "log_claimant",
      email: "private@example.com",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private@example.com");
    expect(JSON.stringify(warn.mock.calls)).toContain("log_claimant");
  });

  test("acknowledges a duplicate-email user.created instead of throwing", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "ack_owner", email: "ack@example.com" });

    await expect(
      t.run(async (ctx) => upsertUser(ctx, { workosId: "ack_claimant", email: "ack@example.com" })),
    ).resolves.toBeTruthy();
  });

  test("requireUser refuses a duplicate-email account", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "req_owner", email: "req@example.com" });
    const asDuplicate = await seedUser(t, {
      subject: "req_claimant",
      email: "req@example.com",
    });

    await expectApiError(
      () => asDuplicate.run(async (ctx) => await requireUser(ctx)),
      "account_deactivated",
    );
  });

  test("lets a new account reuse the email of a WorkOS-deleted user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "gone", email: "reuse@example.com" });
    await t.run(async (ctx) => await deactivateUser(ctx, "gone"));

    await seedUser(t, { subject: "reuser", email: "reuse@example.com" });

    expect(await requireSeededUser(t, "reuser")).toMatchObject({
      isActive: true,
      email: "reuse@example.com",
    });
    expect(await requireSeededUser(t, "reuser")).not.toHaveProperty("deactivatedReason");
    expect(await readCreatorRow(t, "reuser")).not.toBeNull();
  });

  test("an operator-locked user still holds their email", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "locked_owner", email: "held@example.com" });
    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "locked_owner");
      await setUserActive(ctx, user._id, false);
    });

    await seedUser(t, {
      subject: "locked_claimant",
      email: "held@example.com",
    });

    expect(await requireSeededUser(t, "locked_claimant")).toMatchObject({
      isActive: false,
      deactivatedReason: "duplicate_email",
    });
  });

  test("user.updated cannot take another user's email but still updates names", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "email_holder", email: "holder@example.com" });
    await seedUser(t, { subject: "email_taker", email: "taker@example.com" });

    await t.run(async (ctx) =>
      upsertUser(ctx, {
        workosId: "email_taker",
        email: "Holder@Example.com",
        firstName: "Renamed",
        lastName: "Taker",
      }),
    );

    expect(await requireSeededUser(t, "email_taker")).toMatchObject({
      email: "taker@example.com",
      firstName: "Renamed",
      lastName: "Taker",
      isActive: true,
    });
    expect(await requireSeededUser(t, "email_holder")).toMatchObject({
      email: "holder@example.com",
    });
  });

  test("a case-only change to a legacy mixed-case email is stored lowercase without conflict", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        workosId: "legacy_case",
        firstName: "Legacy",
        lastName: "",
        email: "Legacy@Example.com",
        role: "creator",
        isActive: true,
      });
      await ctx.db.insert("creators", { userId });
    });

    await t.run(async (ctx) =>
      upsertUser(ctx, { workosId: "legacy_case", email: "Legacy@Example.com" }),
    );

    expect(await requireSeededUser(t, "legacy_case")).toMatchObject({
      email: "legacy@example.com",
      isActive: true,
    });
  });

  test("an update does not touch the deactivation reason", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "reason_kept" });
    await t.run(async (ctx) => await deactivateUser(ctx, "reason_kept"));

    await seedUser(t, { subject: "reason_kept", firstName: "Again" });

    expect(await requireSeededUser(t, "reason_kept")).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
      firstName: "Again",
    });
  });
});

describe("applyMembership", () => {
  test("creates the company from the event and promotes the user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u6", org: { id: "org_acme", name: "Acme Inc" } });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u6"));
    const companies = await t.run(async (ctx) => await ctx.db.query("companies").collect());
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());

    expect(user?.role).toBe("company");
    expect(companies[0]?.name).toBe("Acme Inc");
    expect(memberships).toHaveLength(1);
  });

  test("two members share one company row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u7", org: { id: "org_acme" } });
    await seedUser(t, { subject: "u8", org: { id: "org_acme" } });

    const counts = await t.run(async (ctx) => ({
      companies: (await ctx.db.query("companies").collect()).length,
      memberships: (await ctx.db.query("companyUsers").collect()).length,
    }));
    expect(counts).toEqual({ companies: 1, memberships: 2 });
  });

  test("a role change updates the membership in place", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u9", org: { id: "org_acme", role: "member" } });
    await t.run(async (ctx) => {
      await applyMembership(ctx, {
        workosUserId: "u9",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
      });
    });

    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("admin");
  });

  test("rejects joining a second company and preserves the original membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "single_company", org: { id: "org_acme", role: "admin" } });
    const before = await t.run(async (ctx) => await ctx.db.query("companyUsers").take(2));

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await applyMembership(ctx, {
              workosUserId: "single_company",
              organizationId: "org_other",
              organizationName: "Other",
              role: "member",
            }),
        ),
      "conflict",
      "already_in_company",
    );

    const after = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("companyUsers").take(2),
      companies: await ctx.db.query("companies").take(2),
      user: await getUserByWorkosId(ctx, "single_company"),
    }));
    expect(after.memberships).toEqual(before);
    expect(after.companies).toHaveLength(1);
    expect(after.user?.role).toBe("company");
  });

  test("does not demote an operator who joins a company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u10" });
    await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "u10");
      await ctx.db.patch("users", user!._id, { role: "operator" });
      await applyMembership(ctx, {
        workosUserId: "u10",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
      });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u10"));
    expect(user?.role).toBe("operator");
  });
  test.each([
    {
      name: "a WorkOS-deleted account",
      lock: async (t: TestConvex) => {
        await t.run(async (ctx) => await deactivateUser(ctx, "locked_rejoin"));
      },
      reason: "deleted",
    },
    {
      name: "an operator-locked account",
      lock: async (t: TestConvex) => {
        await t.run(async (ctx) => {
          const user = await requireSeededUserInCtx(ctx, "locked_rejoin");
          await setUserActive(ctx, user._id, false);
        });
      },
      reason: "operator",
    },
  ])("does not reactivate $name when its membership is re-applied", async ({ lock, reason }) => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "locked_rejoin", org: { id: "org_acme" } });
    await lock(t);

    await t.run(async (ctx) => await applyMembership(ctx, joinOrg("locked_rejoin")));

    const user = await requireSeededUser(t, "locked_rejoin");
    const membership = await t.run(async (ctx) => await getCompanyUserByUserId(ctx, user._id));
    expect(membership?.isActive).toBe(true);
    expect(user).toMatchObject({
      isActive: false,
      deactivatedReason: reason,
    });
  });

  test("does not reactivate a legacy inactive account that has no reason", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "legacy_inactive", org: { id: "org_acme" } });
    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "legacy_inactive");
      await ctx.db.patch("users", user._id, { isActive: false });
    });

    await t.run(async (ctx) => await applyMembership(ctx, joinOrg("legacy_inactive")));

    const user = await requireSeededUser(t, "legacy_inactive");
    expect(user.isActive).toBe(false);
    expect(user.deactivatedReason).toBeUndefined();
  });

  test("does not unlock a duplicate-email account", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "dup_owner", email: "dup@example.com" });
    await seedUser(t, { subject: "dup_claimant", email: "dup@example.com" });

    await t.run(async (ctx) => await applyMembership(ctx, joinOrg("dup_claimant")));

    const user = await requireSeededUser(t, "dup_claimant");
    const membership = await t.run(async (ctx) => await getCompanyUserByUserId(ctx, user._id));
    expect(membership?.isActive).toBe(true);
    expect(user).toMatchObject({
      role: "company",
      isActive: false,
      deactivatedReason: "duplicate_email",
    });
  });

  describe("a creator who already has marketplace activity", () => {
    async function seedActiveCreator(
      t: TestConvex,
      activity: "xAccount" | "application" | "assignment",
    ) {
      let creatorId: Id<"creators">;
      if (activity === "xAccount") {
        ({ creatorId } = await seedXAccount(t, "busy_creator"));
      } else {
        creatorId = await seedCreatorId(t, "busy_creator");
        const { opportunityId, membership } = await seedOpportunity(t, {
          subject: "busy_owner",
          orgId: "org_owner",
        });
        if (activity === "application") {
          await t.run(
            async (ctx) =>
              await ctx.db.insert("applications", {
                opportunityId,
                creatorId,
                companyId: membership.companyId,
                status: "declined",
              }),
          );
        } else {
          await seedAssignment(t, {
            opportunityId,
            creatorId,
            status: "active",
          });
        }
      }
      return creatorId;
    }

    test.each(["xAccount", "application", "assignment"] as const)(
      "is not converted to a company account when they have an %s",
      async (activity) => {
        const t = convexTest(schema, modules);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const creatorId = await seedActiveCreator(t, activity);

        await t.run(
          async (ctx) => await applyMembership(ctx, joinOrg("busy_creator", "org_target")),
        );

        const user = await requireSeededUser(t, "busy_creator");
        const state = await t.run(async (ctx) => ({
          membership: await getCompanyUserByUserId(ctx, user._id),
          company: await getCompanyByWorkosId(ctx, "org_target"),
          creator: await getCreatorByUserId(ctx, user._id),
        }));
        expect(user).toMatchObject({ role: "creator", isActive: true });
        expect(state.membership).toBeNull();
        expect(state.company).toBeNull();
        expect(state.creator?._id).toBe(creatorId);
      },
    );
  });
});

describe("removeMembership", () => {
  test("keeps the membership row so attribution survives", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "kept_membership", org: { id: "org_acme" } });
    const before = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, {
          workosUserId: "kept_membership",
          organizationId: "org_acme",
        }),
    );

    const after = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());

    expect(after).toHaveLength(1);
    expect(after[0]?._id).toBe(before[0]?._id);
    expect(after[0]?.isActive).toBe(false);
  });

  test("deactivates the account instead of turning them back into a creator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u11", org: { id: "org_acme" } });
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "u11", organizationId: "org_acme" }),
    );

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u11"));

    expect(user?.role).toBe("company");
    expect(user?.isActive).toBe(false);
  });

  test("rejoining a company reopens the membership and restores access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "rejoin", org: { id: "org_acme" } });
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "rejoin", organizationId: "org_acme" }),
    );
    await t.run(
      async (ctx) =>
        await applyMembership(ctx, {
          workosUserId: "rejoin",
          organizationId: "org_acme",
          organizationName: "Acme",
          role: "admin",
        }),
    );

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "rejoin"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());

    expect(user?.isActive).toBe(true);
    expect(user?.deactivatedReason).toBeUndefined();
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.isActive).toBe(true);
    expect(memberships[0]?.role).toBe("admin");
  });

  test("ignores a removal event for another company", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u12", org: { id: "org_acme" } });
    await seedUser(t, { subject: "u12_other", org: { id: "org_other" } });
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "u12", organizationId: "org_other" }),
    );

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u12"));
    expect(user?.role).toBe("company");
  });

  test("records left_company as the deactivation reason", async () => {
    const t = convexTest(schema, modules);
    await seedLeftCompanyUser(t, "left_reason");

    expect(await requireSeededUser(t, "left_reason")).toMatchObject({
      isActive: false,
      deactivatedReason: "left_company",
    });
  });

  test("does not overwrite an operator lock when the member is removed", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "operator_then_left",
      org: { id: "org_acme" },
    });
    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "operator_then_left");
      await setUserActive(ctx, user._id, false);
      await removeMembership(ctx, {
        workosUserId: "operator_then_left",
        organizationId: "org_acme",
      });
    });

    expect(await requireSeededUser(t, "operator_then_left")).toMatchObject({
      isActive: false,
      deactivatedReason: "operator",
    });
  });

  test("does not overwrite a WorkOS deletion when the member is removed afterwards", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "deleted_then_left",
      org: { id: "org_acme" },
    });
    await t.run(async (ctx) => {
      await deactivateUser(ctx, "deleted_then_left");
      await removeMembership(ctx, {
        workosUserId: "deleted_then_left",
        organizationId: "org_acme",
      });
    });

    expect(await requireSeededUser(t, "deleted_then_left")).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
    });
  });
});

describe("deactivateUser", () => {
  test("records deleted as the deactivation reason", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "deleted_reason" });
    await t.run(async (ctx) => await deactivateUser(ctx, "deleted_reason"));

    expect(await requireSeededUser(t, "deleted_reason")).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
    });
  });

  test("overrides left_company on an already inactive account", async () => {
    const t = convexTest(schema, modules);
    await seedLeftCompanyUser(t, "left_then_deleted");
    await t.run(async (ctx) => await deactivateUser(ctx, "left_then_deleted"));

    expect(await requireSeededUser(t, "left_then_deleted")).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
    });
  });
  test("soft deletes rather than removing the row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u13" });
    await t.run(async (ctx) => await deactivateUser(ctx, "u13"));

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u13"));
    expect(user).not.toBeNull();
    expect(user?.isActive).toBe(false);
  });
});

describe("requireUser / requireRole", () => {
  test("rejects a caller whose webhook has not landed", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity(workosIdentity({ subject: "u14" }));

    await expectApiError(() => asUser.run(async (ctx) => await requireUser(ctx)), "not_synced");
  });

  test("rejects a deactivated account", async () => {
    const t = convexTest(schema, modules);
    const asUser = await seedUser(t, { subject: "u15" });
    await t.run(async (ctx) => await deactivateUser(ctx, "u15"));

    await expectApiError(
      () => asUser.run(async (ctx) => await requireUser(ctx)),
      "account_deactivated",
    );
  });

  test("rejects the wrong account type", async () => {
    const t = convexTest(schema, modules);
    const asCreator = await seedUser(t, { subject: "u16" });

    await expectApiError(
      () => asCreator.run(async (ctx) => await requireRole(ctx, "company")),
      "forbidden",
    );
  });

  test("returns the caller and their org for the right type", async () => {
    const t = convexTest(schema, modules);
    const asCompany = await seedUser(t, { subject: "u17", org: { id: "org_acme" } });

    const result = await asCompany.run(async (ctx) => await requireRole(ctx, "company"));

    expect(result.user.role).toBe("company");
    expect(result.orgId).toBe("org_acme");
  });
});

describe("requireCallerCreatorId", () => {
  test("returns the creator ID for a creator user", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "u30");

    const result = await t.run(async (ctx) => {
      const user = await getUserByWorkosId(ctx, "u30");
      if (user === null) throw new Error("expected seeded user");
      return await requireCallerCreatorId(ctx, user);
    });

    expect(result).toBe(creatorId);
  });

  test("throws not_found when the user has no creator row", async () => {
    const t = convexTest(schema, modules);
    const creatorId = await seedCreatorId(t, "u31");
    await t.run(async (ctx) => await ctx.db.delete("creators", creatorId));

    await expectApiError(
      () =>
        t.run(async (ctx) => {
          const user = await getUserByWorkosId(ctx, "u31");
          if (user === null) throw new Error("expected seeded user");
          return await requireCallerCreatorId(ctx, user);
        }),
      "not_found",
    );
  });
});

describe("out-of-order webhook delivery", () => {
  test("a membership arriving before the user is not silently dropped", async () => {
    const t = convexTest(schema, modules);

    // WorkOS gives no cross-topic ordering guarantee, so the membership event
    // can beat user.created. Throwing is what makes WorkOS retry it.
    await expectApiError(
      () =>
        t.run(async (ctx) => {
          await applyMembership(ctx, {
            workosUserId: "u18",
            organizationId: "org_acme",
            organizationName: "Acme",
            role: "admin",
          });
        }),
      "not_synced",
    );

    // On retry, after user.created has landed, it applies.
    await seedUser(t, { subject: "u18" });
    await t.run(async (ctx) => {
      await applyMembership(ctx, {
        workosUserId: "u18",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
      });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u18"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(user?.role).toBe("company");
    expect(memberships).toHaveLength(1);
  });

  test("a membership arriving after the user was deleted is recorded but leaves the account locked", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "late_membership" });
    await t.run(async (ctx) => await deactivateUser(ctx, "late_membership"));

    await t.run(async (ctx) => await applyMembership(ctx, joinOrg("late_membership")));

    const user = await requireSeededUser(t, "late_membership");
    const membership = await t.run(async (ctx) => await getCompanyUserByUserId(ctx, user._id));
    expect(membership?.isActive).toBe(true);
    expect(user).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
    });
  });

  test("a rejoin after removal and a late user.deleted leaves the account locked", async () => {
    const t = convexTest(schema, modules);
    await seedLeftCompanyUser(t, "removed_deleted_rejoined");
    await t.run(async (ctx) => {
      await deactivateUser(ctx, "removed_deleted_rejoined");
      await applyMembership(ctx, joinOrg("removed_deleted_rejoined"));
    });

    expect(await requireSeededUser(t, "removed_deleted_rejoined")).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
    });
  });
});

describe("setUserActive", () => {
  test("deactivating an active account records operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "op_deactivate" });

    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "op_deactivate");
      await setUserActive(ctx, user._id, false);
    });

    expect(await requireSeededUser(t, "op_deactivate")).toMatchObject({
      isActive: false,
      deactivatedReason: "operator",
    });
  });

  test("deactivating a left_company account upgrades it to operator so a later rejoin cannot unlock it", async () => {
    const t = convexTest(schema, modules);
    await seedLeftCompanyUser(t, "left_upgraded");
    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "left_upgraded");
      await setUserActive(ctx, user._id, false);
    });
    expect(await requireSeededUser(t, "left_upgraded")).toMatchObject({
      deactivatedReason: "operator",
    });

    await t.run(async (ctx) => await applyMembership(ctx, joinOrg("left_upgraded")));

    expect(await requireSeededUser(t, "left_upgraded")).toMatchObject({
      isActive: false,
      deactivatedReason: "operator",
    });
  });

  test.each(["deleted", "duplicate_email"] as const)(
    "deactivating an account already locked as %s leaves the reason unchanged",
    async (reason) => {
      const t = convexTest(schema, modules);
      await seedUser(t, { subject: "keep_reason" });
      await t.run(async (ctx) => {
        const user = await requireSeededUserInCtx(ctx, "keep_reason");
        await ctx.db.patch("users", user._id, {
          isActive: false,
          deactivatedReason: reason,
        });
        await setUserActive(ctx, user._id, false);
      });

      expect(await requireSeededUser(t, "keep_reason")).toMatchObject({
        isActive: false,
        deactivatedReason: reason,
      });
    },
  );

  test("reactivating clears the reason", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "op_reactivate" });
    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "op_reactivate");
      await setUserActive(ctx, user._id, false);
      await setUserActive(ctx, user._id, true);
    });

    const user = await requireSeededUser(t, "op_reactivate");
    expect(user.isActive).toBe(true);
    expect(user.deactivatedReason).toBeUndefined();
  });

  test("refuses to reactivate a company user who has no active membership", async () => {
    const t = convexTest(schema, modules);
    await seedLeftCompanyUser(t, "no_membership");

    await expectApiError(
      () =>
        t.run(async (ctx) => {
          const user = await requireSeededUserInCtx(ctx, "no_membership");
          return await setUserActive(ctx, user._id, true);
        }),
      "invalid_state",
      "no_active_membership",
    );

    expect(await requireSeededUser(t, "no_membership")).toMatchObject({
      isActive: false,
      deactivatedReason: "left_company",
    });
  });

  test("reactivates a legacy inactive company user who still has an active membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, {
      subject: "legacy_reactivate",
      org: { id: "org_acme" },
    });
    await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "legacy_reactivate");
      await ctx.db.patch("users", user._id, { isActive: false });
      await setUserActive(ctx, user._id, true);
    });

    expect((await requireSeededUser(t, "legacy_reactivate")).isActive).toBe(true);
  });

  test("refuses to reactivate a duplicate-email account while the other account holds the email", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, {
      subject: "email_owner",
      email: "contested@example.com",
    });
    await seedUser(t, {
      subject: "email_loser",
      email: "contested@example.com",
    });

    await expectApiError(
      () =>
        t.run(async (ctx) => {
          const user = await requireSeededUserInCtx(ctx, "email_loser");
          return await setUserActive(ctx, user._id, true);
        }),
      "invalid_state",
      "email_in_use",
    );

    expect((await requireSeededUser(t, "email_loser")).isActive).toBe(false);
  });

  test("reactivates a duplicate-email account once the owner is deleted and gives it a creator profile", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await seedUser(t, { subject: "freed_owner", email: "freed@example.com" });
    await seedUser(t, {
      subject: "freed_claimant",
      email: "freed@example.com",
    });
    await t.run(async (ctx) => await deactivateUser(ctx, "freed_owner"));

    const creatorId = await t.run(async (ctx) => {
      const user = await requireSeededUserInCtx(ctx, "freed_claimant");
      await setUserActive(ctx, user._id, true);
      const reloaded = await requireSeededUserInCtx(ctx, "freed_claimant");
      return await requireCallerCreatorId(ctx, reloaded);
    });

    const user = await requireSeededUser(t, "freed_claimant");
    expect(user.isActive).toBe(true);
    expect(user.deactivatedReason).toBeUndefined();
    expect((await readCreatorRow(t, "freed_claimant"))?._id).toBe(creatorId);
  });

  test("is a no-op on an account that is already active", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "already_active" });
    const before = await requireSeededUser(t, "already_active");

    const result = await t.run(async (ctx) => await setUserActive(ctx, before._id, true));

    expect(result).toEqual(before);
    expect(await requireSeededUser(t, "already_active")).toEqual(before);
  });

  test("throws not_found for a user that no longer exists", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "vanished" });
    const userId = (await requireSeededUser(t, "vanished"))._id;
    await t.run(async (ctx) => {
      const creator = await getCreatorByUserId(ctx, userId);
      if (creator !== null) await ctx.db.delete("creators", creator._id);
      await ctx.db.delete("users", userId);
    });

    await expectApiError(
      () => t.run(async (ctx) => await setUserActive(ctx, userId, true)),
      "not_found",
    );
  });
});

describe("syncMembership", () => {
  test("a pending invitation grants no access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u19" });
    await t.run(async (ctx) => {
      await syncMembership(ctx, {
        workosUserId: "u19",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
        status: "pending",
      });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u19"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(user?.role).toBe("creator");
    expect(memberships).toHaveLength(0);
  });

  test("deactivation revokes access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u20", org: { id: "org_acme" } });

    // WorkOS deactivates by flipping status to inactive — no deleted event fires.
    await t.run(async (ctx) => {
      await syncMembership(ctx, {
        workosUserId: "u20",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "member",
        status: "inactive",
      });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u20"));
    const memberships = await t.run(async (ctx) => await ctx.db.query("companyUsers").collect());
    expect(user?.isActive).toBe(false);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.isActive).toBe(false);
  });

  test("an active membership grants access", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "u21" });
    await t.run(async (ctx) => {
      await syncMembership(ctx, {
        workosUserId: "u21",
        organizationId: "org_acme",
        organizationName: "Acme",
        role: "admin",
        status: "active",
      });
    });

    const user = await t.run(async (ctx) => await getUserByWorkosId(ctx, "u21"));
    expect(user?.role).toBe("company");
  });
});

describe("the Tomoji staff org", () => {
  const STAFF_ORG = "org_tomoji";

  async function joinStaffOrg(t: TestConvex, subject: string) {
    await t.run(
      async (ctx) =>
        await applyMembership(ctx, {
          workosUserId: subject,
          organizationId: STAFF_ORG,
          organizationName: "Tomoji",
          role: "admin",
        }),
    );
  }

  beforeEach(() => {
    vi.stubEnv("WORKOS_OPERATOR_ORG_ID", STAFF_ORG);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("joining it makes the user an operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff1" });

    await joinStaffOrg(t, "staff1");

    expect(await requireSeededUser(t, "staff1")).toMatchObject({ role: "operator" });
  });

  // Operators work across every company, so giving them one of their own
  // would scope them to it.
  test("joining it creates no company and no membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff2" });

    await joinStaffOrg(t, "staff2");

    const user = await requireSeededUser(t, "staff2");
    expect(await t.run(async (ctx) => await getCompanyByWorkosId(ctx, STAFF_ORG))).toBeNull();
    expect(await t.run(async (ctx) => await getCompanyUserByUserId(ctx, user._id))).toBeNull();
  });

  test("rejoining it restores someone who had left", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff3" });
    await joinStaffOrg(t, "staff3");
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "staff3", organizationId: STAFF_ORG }),
    );

    await joinStaffOrg(t, "staff3");

    const user = await requireSeededUser(t, "staff3");
    expect(user).toMatchObject({ role: "operator", isActive: true });
    expect(user.deactivatedReason).toBeUndefined();
  });

  // Anyone with WorkOS admin can add a user to an organization, so the staff
  // org must not be a way around a deliberate lock.
  test("joining it does not undo an operator lock", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff_locked" });
    const locked = await requireSeededUser(t, "staff_locked");
    await t.run(async (ctx) => await setUserActive(ctx, locked._id, false));

    await joinStaffOrg(t, "staff_locked");

    expect(await requireSeededUser(t, "staff_locked")).toMatchObject({
      isActive: false,
      deactivatedReason: "operator",
    });
  });

  test("joining it does not revive an account WorkOS deleted", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff_deleted" });
    await t.run(async (ctx) => await deactivateUser(ctx, "staff_deleted"));

    await joinStaffOrg(t, "staff_deleted");

    expect(await requireSeededUser(t, "staff_deleted")).toMatchObject({
      isActive: false,
      deactivatedReason: "deleted",
    });
  });

  test("leaving it deactivates the operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff4" });
    await joinStaffOrg(t, "staff4");

    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "staff4", organizationId: STAFF_ORG }),
    );

    expect(await requireSeededUser(t, "staff4")).toMatchObject({
      isActive: false,
      deactivatedReason: "left_company",
    });
  });

  // The role stays so an operator can restore them; the lockout is isActive.
  test("leaving it leaves an inactive operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff_demote" });
    await joinStaffOrg(t, "staff_demote");

    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "staff_demote", organizationId: STAFF_ORG }),
    );

    expect(await requireSeededUser(t, "staff_demote")).toMatchObject({
      role: "operator",
      isActive: false,
      deactivatedReason: "left_company",
    });
  });

  // A company admin can invite any email, so without this a removed operator
  // regains cross-company access the moment any customer invites them.
  test("a removed operator who joins a company becomes a company user, not an operator", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff_rejoin" });
    await joinStaffOrg(t, "staff_rejoin");
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, { workosUserId: "staff_rejoin", organizationId: STAFF_ORG }),
    );

    await t.run(
      async (ctx) =>
        await applyMembership(ctx, {
          workosUserId: "staff_rejoin",
          organizationId: "org_acme",
          organizationName: "Acme",
          role: "member",
        }),
    );

    expect(await requireSeededUser(t, "staff_rejoin")).toMatchObject({
      role: "company",
      isActive: true,
    });
  });

  // A serving operator works across every company, so belonging to one is
  // meaningless; recording it would also list staff among a customer's people.
  test("a serving operator added to a company gains no membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff_also_company" });
    await joinStaffOrg(t, "staff_also_company");
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

    await t.run(
      async (ctx) =>
        await applyMembership(ctx, {
          workosUserId: "staff_also_company",
          organizationId: "org_acme",
          organizationName: "Acme",
          role: "member",
        }),
    );

    expect(await requireSeededUser(t, "staff_also_company")).toMatchObject({ role: "operator" });
    expect(await t.run(async (ctx) => await ctx.db.query("companyUsers").collect())).toEqual([]);
    // Pins the log: it is the only signal that a membership was dropped.
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  // Promotion leaves their creator row, so a former operator can still own X
  // links and assignments that converting them would strand.
  test("a removed operator with creator activity is not converted to a company user", async () => {
    const t = convexTest(schema, modules);
    await seedXAccount(t, "staff_with_activity");
    await joinStaffOrg(t, "staff_with_activity");
    await t.run(
      async (ctx) =>
        await removeMembership(ctx, {
          workosUserId: "staff_with_activity",
          organizationId: STAFF_ORG,
        }),
    );
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});

    await t.run(
      async (ctx) =>
        await applyMembership(ctx, {
          workosUserId: "staff_with_activity",
          organizationId: "org_acme",
          organizationName: "Acme",
          role: "member",
        }),
    );

    expect(await requireSeededUser(t, "staff_with_activity")).toMatchObject({
      role: "operator",
      isActive: false,
    });
    expect(await t.run(async (ctx) => await ctx.db.query("companyUsers").collect())).toEqual([]);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  // Without the env var every org looks like a customer, so a staff invite
  // would quietly create a company instead of an operator.
  test("is just another company when the deployment does not name one", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("WORKOS_OPERATOR_ORG_ID", "");
    await seedUser(t, { subject: "staff5" });

    await joinStaffOrg(t, "staff5");

    expect(await requireSeededUser(t, "staff5")).toMatchObject({ role: "company" });
    expect(await t.run(async (ctx) => await getCompanyByWorkosId(ctx, STAFF_ORG))).not.toBeNull();
  });

  test("a different org still makes an ordinary company user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, { subject: "staff6", org: { id: "org_acme" } });

    expect(await requireSeededUser(t, "staff6")).toMatchObject({ role: "company" });
  });
});
