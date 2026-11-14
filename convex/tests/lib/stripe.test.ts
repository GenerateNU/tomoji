import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { stripeClient } from "../../lib/stripe";
import { expectApiError } from "../helpers";

beforeEach(() => vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_tomoji"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("stripeClient", () => {
  test("refuses to build a client without a secret key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expectApiError(async () => stripeClient(), "misconfigured", "stripe_secret_key_missing");
  });

  // Convex's default runtime has fetch but not Node's http module, so the
  // client must send through fetch for actions and the webhook to work.
  test("sends requests through fetch with the deployment's key", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "acct_test", object: "account" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const account = await stripeClient().accounts.retrieve("acct_test");

    expect(account.id).toBe("acct_test");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.stripe.com/v1/accounts/acct_test");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk_test_tomoji");
  });
});
