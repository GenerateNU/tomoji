import type { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import type { Infer } from "convex/values";
import { expect } from "vitest";
import type { ApiErrorCode } from "../lib/errors";
import { applyMembership, upsertUser } from "../models/users";
import type { companyRole } from "../schemas/companyUsers.schema";

export type TestConvex = ReturnType<typeof convexTest>;

/** A fake WorkOS token. */
export function workosIdentity(claims: {
  subject: string;
  email?: string;
  name?: string;
  org_id?: string;
  role?: string;
}): Partial<UserIdentity> {
  return claims as Partial<UserIdentity>;
}

/** Asserts a call fails with a specific API error code. */
export async function expectApiError(call: () => Promise<unknown>, code: ApiErrorCode) {
  await expect(call()).rejects.toThrow(new RegExp(`"code":"${code}"`));
}

export type SeedOptions = {
  subject: string;
  email?: string;
  org?: { id: string; name?: string; role?: Infer<typeof companyRole> };
};

/**
 * Applies the webhook handlers' effects directly, then returns a client
 * carrying the matching token.
 */
export async function seedUser(t: TestConvex, opts: SeedOptions) {
  await t.run(async (ctx) => {
    await upsertUser(ctx, {
      workosId: opts.subject,
      email: opts.email ?? `${opts.subject}@example.com`,
    });
    if (opts.org) {
      await applyMembership(ctx, {
        workosUserId: opts.subject,
        organizationId: opts.org.id,
        organizationName: opts.org.name ?? "Acme",
        role: opts.org.role ?? "member",
      });
    }
  });

  return t.withIdentity(
    workosIdentity({ subject: opts.subject, org_id: opts.org?.id, role: opts.org?.role }),
  );
}
