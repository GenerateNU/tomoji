import { cookies } from "next/headers";
import { safeNext } from "./access";

/**
 * When WorkOS wants an emailed code before finishing sign-in, it hands back a
 * pending token. We hold it in an httpOnly cookie so it never reaches page
 * HTML or client JavaScript.
 */
const COOKIE = "tomoji-pending-auth";

export type PendingAuth = { token: string; email: string; next: string };

export async function savePendingAuth(pending: PendingAuth): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // WorkOS verification codes last 10 minutes.
    maxAge: 10 * 60,
  });
}

export async function readPendingAuth(): Promise<PendingAuth | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "token" in parsed &&
      "email" in parsed &&
      typeof parsed.token === "string" &&
      typeof parsed.email === "string"
    ) {
      // Older cookies have no `next`; the cookie is client-held, so re-validate it.
      const next =
        "next" in parsed && typeof parsed.next === "string" ? safeNext(parsed.next) : "/";
      return { token: parsed.token, email: parsed.email, next };
    }
  } catch {
    // Fall through: a tampered or stale cookie is treated as missing.
  }
  return null;
}

export async function clearPendingAuth(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
