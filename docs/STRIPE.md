# Stripe creator payouts

Creators get paid through Stripe Connect. Each creator has their own **Standard** connected
account: Stripe hosts the signup form, the creator signs in to the full Stripe Dashboard at
dashboard.stripe.com themselves, and they pay Stripe's processing fees. Tomoji takes no fee for
now.

This covers creator onboarding only. Company payment methods, charging, and payment webhooks
come in later PRs.

## Setup on your dev deployment

Stripe is optional. Without `STRIPE_SECRET_KEY`, everything else works and the Stripe routes
fail with `misconfigured`. To work on payments:

1. In the shared Stripe **sandbox**, copy a test secret key (`sk_test_…`) from
   **Developers → API keys**. Live keys are refused by `just convex-env`.
2. Add a webhook destination in **Developers → Webhooks → Add destination**:
   - Scope: **Connected accounts** (creators are Connect v1 accounts).
   - Payload style: **Snapshot**, API version `2026-09-30.endive` (the version our `stripe`
     package pins).
   - Events: `account.updated` only.
   - Type: **Webhook endpoint**, URL `https://<your-deployment>.convex.site/stripe/webhook`.
     Running `just convex-env` with an empty secret prints your exact URL.
   - Name it after yourself (`<name>-dev-creator-onboarding`). The sandbox is shared, so
     every teammate has their own destination.
3. Fill in `.env.local`: `STRIPE_SECRET_KEY`, the destination's signing secret as
   `STRIPE_WEBHOOK_SECRET` (`whsec_…`), and `SITE_URL=http://localhost:3000`.
4. Run `just convex-env`.

Every teammate's destination receives every connected account's events. The webhook answers
200 to accounts it doesn't know, so other people's test accounts are ignored, not retried.

## Creator status

`stripeAccounts.me` returns one of four statuses. They are worked out from the account's
latest Stripe details each time, never stored.

| Status           | Meaning                                                     | What the UI shows                             |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `notStarted`     | No Stripe account yet                                       | "Connect with Stripe" button                  |
| `actionRequired` | Form not finished, or Stripe asked for more information     | "Finish setting up Stripe" button (same link) |
| `inReview`       | Form submitted; Stripe is verifying (minutes to a few days) | "Stripe is reviewing your details", no button |
| `ready`          | Payouts are enabled                                         | Nothing                                       |

Creators can't apply to opportunities until they are `ready` (agreed with Karim). That check
isn't built yet.

## Routes

| Route                           | Type   | Returns                                                       |
| ------------------------------- | ------ | ------------------------------------------------------------- |
| `stripeAccounts.me`             | query  | `{ status }`                                                  |
| `stripeAccounts.onboardingLink` | action | `{ url }` to Stripe's form; creates the account on first call |

Both are creator-only; companies and operators get `forbidden`.

`onboardingLink` URLs are single-use and expire within minutes, so request one when the
creator clicks, never ahead of time. Stripe sends the creator back to
`/profile?stripe=return` when they leave the form, or `/profile?stripe=refresh` when the link
expired, in which case call `onboardingLink` again and redirect. Coming back does **not**
mean onboarding finished; `me` updates on its own when Stripe's webhook arrives.

There is no dashboard link route. Stripe only issues login links for Express accounts;
Standard creators use `https://dashboard.stripe.com`.

Errors (`ConvexError` data):

| `code` / `reason`                             | Cause                                        |
| --------------------------------------------- | -------------------------------------------- |
| `misconfigured` / `stripe_secret_key_missing` | Deployment has no `STRIPE_SECRET_KEY`        |
| `misconfigured` / `site_url_missing`          | Deployment has no `SITE_URL`                 |
| `upstream_failure` / `stripe_account_failed`  | Stripe refused to create the account         |
| `upstream_failure` / `stripe_link_failed`     | Stripe refused the link; the account is kept |

Stripe's reason for either failure is in the deployment logs (`just dashboard` → Logs).

## How status stays correct

Only the `POST /stripe/webhook` endpoint changes a creator's Stripe details. It:

- rejects any request whose signature doesn't match `STRIPE_WEBHOOK_SECRET` (400), and
  answers 500 while the secret is unset so Stripe keeps retrying;
- skips events older than the details already saved, because Stripe can deliver out of order;
- answers 200 to every other verified event, including types it ignores.

A creator never ends up with two accounts:

- The account is saved before the onboarding link is requested, so a failed link reuses it.
- Concurrent clicks send Stripe the same idempotency key and get the same account back. The key
  includes a fingerprint of the request, because Stripe refuses a reused key with different
  parameters for 24 hours.
- If saving fails after Stripe created the account, the next `account.updated` event carries
  `metadata.creatorId` and the webhook adopts the account for that creator.

## Trying it end to end

With `just bd` running and your own creator account (find your WorkOS id in the `users`
table):

```bash
bunx convex run stripeAccounts:onboardingLink '{}' --identity '{"subject":"<your workosId>"}'
```

Open the returned URL and use Stripe's test values: test phone number with code `000000`,
date of birth `01/01/1901`, address line 1 `address_full_match`, SSN `000-00-0000`, and the
**Test (Non-OAuth)** bank's **Success** account. Then watch the status move from
`actionRequired` through `inReview` to `ready`:

```bash
bunx convex run stripeAccounts:me '{}' --identity '{"subject":"<your workosId>"}'
```
