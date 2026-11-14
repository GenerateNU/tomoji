# Stripe payouts

Creators get paid through Stripe Connect. Each creator has their own **Standard** connected
account: Stripe hosts the signup form, the creator signs in to the full Stripe Dashboard at
dashboard.stripe.com themselves, and they pay Stripe's processing fees. Tomoji takes no fee for
now.

Companies pay with a card they save once through Stripe Checkout. It is stored on a Stripe
customer on Tomoji's own account and copied to a creator's account for each charge.

This covers creator onboarding, saving company cards, and charging approved payouts. Recovering
failed charges, and refunds and disputes, come in later PRs.

## Setup on your dev deployment

Stripe is optional. Without `STRIPE_SECRET_KEY`, everything else works and the Stripe routes
fail with `misconfigured`. To work on payments:

1. In the shared Stripe **sandbox**, copy a test secret key (`sk_test_…`) from
   **Developers → API keys**. Live keys are refused by `just convex-env`.
2. Add a webhook destination in **Developers → Webhooks → Add destination**:
   - Scope: **Connected accounts** (creators are Connect v1 accounts).
   - Payload style: **Snapshot**, API version `2026-09-30.endive` (the version our `stripe`
     package pins).
   - Events: `account.updated`, `account.application.deauthorized`,
     `payment_intent.succeeded`, `payment_intent.payment_failed`, and `charge.updated`. If you
     made the destination earlier, edit it and add the ones it's missing.
   - Type: **Webhook endpoint**, URL `https://<your-deployment>.convex.site/stripe/webhook`.
     Running `just convex-env` with an empty secret prints your exact URL.
   - Name it after yourself (`<name>-dev-creator-onboarding`). The sandbox is shared, so
     every teammate has their own destination.
3. Add a second destination the same way for company cards, because Stripe sends events on
   Tomoji's own account separately from Connect events:
   - Scope: **Your account**.
   - Events: `checkout.session.completed` and `payment_method.automatically_updated`.
   - URL `https://<your-deployment>.convex.site/stripe/webhook/platform`, name
     `<name>-dev-company-cards`.
4. Fill in `.env.local`: `STRIPE_SECRET_KEY`, the first destination's signing secret as
   `STRIPE_WEBHOOK_SECRET`, the second's as `STRIPE_PLATFORM_WEBHOOK_SECRET` (both `whsec_…`),
   and `SITE_URL=http://localhost:3000`.
5. Run `just convex-env`.

Every teammate's destinations receive everyone's events. The webhooks answer 200 to accounts
and customers they don't know, so other people's test data is ignored, not retried.

## Creator status

`stripeAccounts.me` returns one of five statuses. They are worked out from the account's
latest Stripe details each time, never stored.

| Status           | Meaning                                                     | What the UI shows                             |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `notStarted`     | No Stripe account yet                                       | "Connect with Stripe" button                  |
| `actionRequired` | Form not finished, or Stripe asked for more information     | "Finish setting up Stripe" button (same link) |
| `inReview`       | Form submitted; Stripe is verifying (minutes to a few days) | "Stripe is reviewing your details", no button |
| `ready`          | Payouts are enabled                                         | Nothing                                       |
| `rejected`       | Stripe declined the account for good (e.g. fraud)           | "Contact Stripe support", no button           |
| `disconnected`   | The creator removed Tomoji from their Stripe account        | "Reconnect Stripe" button (same route)        |

Reconnecting creates a **new** Stripe account; Stripe offers no way to reattach the old one.
The creator keeps the old account and any money already in it. An account becomes
`disconnected` when the `account.application.deauthorized` event arrives, or as soon as Stripe
refuses Tomoji access to it, so a missing event can't leave the creator stuck.

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

### Country

The account is created in the creator's profile country (`countryOfResidence`), and **Stripe
can never change it**. Before the first `onboardingLink` call, the UI should confirm it, e.g.
"Your Stripe account will be set up for Canada; this can't be changed later." If it's missing,
`onboardingLink` returns `country_required` without contacting Stripe; ask for it (a picker in
the connect dialog that saves to the profile works) and call again. Later profile changes don't
affect an existing account. A creator who moves needs a new account: they disconnect Tomoji in
their Stripe Dashboard, update their profile country, and reconnect.

Payouts are in USD. Non-US accounts receive them converted to their own currency.

Errors (`ConvexError` data):

| `code` / `reason`                               | Cause                                                          |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `invalid_state` / `country_required`            | The creator has no profile country                             |
| `invalid_state` / `stripe_country_unsupported`  | Stripe doesn't operate in that country; they may change it     |
| `invalid_state` / `stripe_account_disconnected` | The creator removed Tomoji in Stripe; calling again reconnects |
| `misconfigured` / `stripe_secret_key_missing`   | Deployment has no `STRIPE_SECRET_KEY`                          |
| `misconfigured` / `site_url_missing`            | Deployment has no `SITE_URL`                                   |
| `upstream_failure` / `stripe_account_failed`    | Stripe refused to create the account                           |
| `upstream_failure` / `stripe_link_failed`       | Stripe refused the link; the account is kept                   |

Stripe's reason for any failure is in the deployment logs (`just dashboard` → Logs).

## How status stays correct

`onboardingLink` saves a new account; after that, only what Stripe reports changes it, mostly
through the `POST /stripe/webhook` endpoint. It:

- rejects any request whose signature doesn't match `STRIPE_WEBHOOK_SECRET` (400), and
  answers 500 while the secret is unset so Stripe keeps retrying;
- on `account.updated`, reads the account from Stripe as it is now rather than trusting the
  event's copy, because two events in the same second can arrive in either order. Each save is
  stamped with when that read finished, and a read older than the saved one is skipped, so two
  deliveries saving in reverse order can't restore an earlier state. About five seconds after
  each save it reads the account once more, so even reads whose stamps tie, or come from servers
  with slightly different clocks, settle on Stripe's real state. If Stripe can't be reached
  it answers 500 so Stripe redelivers; if Tomoji has lost access, the creator disconnected, so
  it marks the account `disconnected` and answers 200;
- on `account.application.deauthorized`, marks the account `disconnected`. Later updates never
  undo that, and events for an account the creator has since replaced are ignored;
- answers 200 to every other verified event, including types it ignores.

A creator never ends up with two accounts:

- Before calling Stripe, `onboardingLink` records the attempt and its country in
  `stripeAccountCreations`. A retry repeats exactly that request, even if the creator's profile
  changed meanwhile, so Stripe returns the same account. The request contains nothing else
  that can change (no email).
- Concurrent clicks and retries share one idempotency key per attempt and get the same account
  back. The key includes a fingerprint of the request, because Stripe refuses a reused key with
  different parameters for 24 hours. A click that starts after another has already saved the
  account gets that account instead of a new attempt.
- When Stripe rejects the request as invalid (an unsupported country or anything else), it made
  no account, so the attempt is dropped and a retry starts fresh instead of Stripe replaying the
  refusal under the old key for 24 hours. A network error keeps the attempt, since Stripe may
  have made the account. Dropping deletes only that attempt, never a newer one, and so does
  saving the account: a delayed save of an old account can't close a newer reconnect attempt.
- Stripe can forget idempotency keys after 24 hours, so a retry first lists accounts created
  since the attempt started and reuses the one tagged with `metadata.creatorId`. If Stripe
  can't be asked, the retry stops with `stripe_account_failed` and keeps the attempt, rather
  than treating "couldn't look" as "no account".
- The account is saved before the onboarding link is requested, so a failed link reuses it.
- If saving a creator's **first** account fails after Stripe created it, the next
  `account.updated` event carries `metadata.creatorId` and the webhook adopts it. A reconnecting
  creator already has a (disconnected) row, so their new account is recovered by the lookup on
  their next click instead.
- The lookup never returns the disconnected account being replaced, even if the creator
  reconnects soon after connecting.

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

# Company cards

## Status

`stripeCustomers.me({ asOf })` returns `{ status, card }`. Queries don't rerun as time
passes, so pass `asOf`, the start of the current month in UTC
(`Date.UTC(year, month, 1)`), and the card is checked against that month:

| Status    | Meaning                                 | What the UI shows                                  |
| --------- | --------------------------------------- | -------------------------------------------------- |
| `missing` | No card saved yet                       | "Add a card" button for admins; a note for members |
| `ready`   | A card is on file                       | e.g. "Visa •••• 4242, expires 08/28" and "Replace" |
| `expired` | The saved card is past its expiry month | "Your card expired" and "Update card" for admins   |

`card` is `null` when missing, otherwise `{ brand, last4, expMonth, expYear }`. A card works
through the last day of its expiry month. When the bank renews a card, Stripe updates its expiry
automatically (below), so `expired` usually means the bank didn't renew it. `brand` is
Stripe's network code (`visa`, `mastercard`, `amex`, …), so map it to a display name. Card
numbers never reach Tomoji.

## Routes

| Route                                | Type   | Who                 | Returns                      |
| ------------------------------------ | ------ | ------------------- | ---------------------------- |
| `stripeCustomers.me({ asOf })`       | query  | Any company member  | `{ status, card }`           |
| `stripeCustomers.setupPaymentMethod` | action | Company admins only | `{ url }` to Stripe Checkout |

Members get `forbidden` / `company_admin_required` from `setupPaymentMethod`; creators and
operators get `forbidden` from both.

The Checkout link lasts 24 hours but isn't stored, so request one when the admin clicks. It
saves a card without charging it, and saving a new card replaces the old one.

`setupPaymentMethod({ returnPath })` takes the page to come back to, usually the one with the
button, e.g. `{ returnPath: "/payouts" }`. Stripe sends the admin back to
`/payouts?stripe=return` when they finish, or `/payouts?stripe=cancel` if they back out; any
query already on the path is kept. Only paths on the Tomoji site are accepted, so the flow
can't redirect anywhere else. Coming back does **not** mean the card is saved; `me` changes to
`ready` when the webhook arrives, usually within seconds.

Errors are the same as the creator routes, with `stripe_customer_failed` (Stripe refused to
create the customer) and `stripe_checkout_failed` (Stripe refused the Checkout session; the
customer is kept) in place of the account and link failures, plus `invalid_state` /
`return_path_invalid` for a `returnPath` that isn't a path on the Tomoji site.

## How the card stays correct

Only `POST /stripe/webhook/platform` saves a card, checked against
`STRIPE_PLATFORM_WEBHOOK_SECRET` the same way as the creator webhook. It handles:

- `checkout.session.completed` in setup mode: fetches the saved card from Stripe and stores
  its brand, last 4, and expiry. If Stripe can't be reached it answers 500, so Stripe
  redelivers.
- `payment_method.automatically_updated`: the card network renewed a card. It fetches the card
  from Stripe as it is now, because two updates in the same second can arrive in either order.
  Only the company's current card is updated, so a replaced card never comes back. A renewal updates the card's details only, never the time that orders
  which card the company chose, so a late renewal can't make a newer card look stale.

Events older than the saved card are skipped. The customer is saved before Checkout opens, so
the webhook always finds the company a card belongs to.

A company never ends up with two customers. Concurrent clicks send the same idempotency key and
get one customer back. The customer is created with only `metadata.companyId`, nothing that
can change between attempts like the company name, so a retry after a failed save is the
identical request and returns the same customer. Stripe's dashboard therefore shows customers
by id; search by `companyId` metadata to find a company.

## Trying it end to end

Company routes need a company admin. The seed data has one per company (`bunx convex data
companyUsers`); for the first:

```bash
bunx convex run stripeCustomers:setupPaymentMethod '{"returnPath":"/campaigns"}' --identity '{"subject":"seed_applications_user_0","org_id":"seed_applications_0","role":"admin"}'
```

Open the URL, enter card `4242 4242 4242 4242` with any future expiry, CVC, and ZIP, and save.
Then `stripeCustomers:me '{"asOf": <now in ms>}'` with the same identity returns `ready` with the Visa ending in 4242.

# Payout charges

Approving a payout doesn't move money (see `docs/EARNINGS.md`). Collecting it charges the
company's saved card on the creator's Stripe account, for exactly the payout's `amount` in USD.
Each try is a row in `payments`; the payout keeps only the summary `paymentStatus`.

## Attempts

`internal.payments.start({ payoutId, stripeAccountId })` begins the next attempt (1, 2, …) and
sets the payout to `processing`. It refuses a payout that isn't approved
(`payout_not_approved`), is already paid (`payout_already_paid`), has an attempt in flight
(`payment_in_progress`), or whose assignment has an open dispute (`payout_disputed`).

The charge's idempotency key and `metadata.paymentId` come from the attempt, so an attempt can
never charge twice. **Every retry is a new attempt with a new charge**, never a reuse of a
failed one; that keeps each attempt's outcome final.

| Payout `paymentStatus` | When                                         |
| ---------------------- | -------------------------------------------- |
| `notStarted`           | Approved, not charged yet                    |
| `processing`           | An attempt's charge is in flight             |
| `transferred`          | The charge succeeded; `transferredAt` is set |
| `needsAttention`       | The latest attempt failed; still owed        |

`transferred` means the money reached the creator's Stripe balance, not their bank.

## How outcomes are recorded

Charges happen on creators' accounts, so their events arrive on the Connect webhook,
`POST /stripe/webhook`. Each event names its attempt by `metadata.paymentId` (Stripe copies it
onto the charge), because it can arrive before the charge id is saved.

- `payment_intent.succeeded`: the attempt becomes `succeeded` and the payout `transferred`.
- `payment_intent.payment_failed`: the attempt becomes `failed` with the issuer's reason
  (`failureCode`, e.g. `insufficient_funds`), and the payout `needsAttention`.
- `charge.updated` with a newly attached balance transaction: Stripe adds the fee a few seconds
  after success, for US and non-US accounts alike. The webhook reads it and records
  `stripeFee`, `creatorNet`, and `settlementCurrency`. These are in the creator account's
  currency. In the sandbox, a US$1.00 charge settled as US$0.33 fee and US$0.67 net on a US
  account, and as CA$1.43 with a CA$0.38 fee (including CA$0.03 for currency conversion) and
  CA$1.05 net on a Canadian one. The payout's earned `amount` is never rewritten.

Only a `processing` attempt changes, so repeated or late events can't undo an outcome. Events
without our tag, from another deployment, or from a different account than the attempt charged
are acknowledged and ignored. If the fee can't be fetched the webhook answers 500 so Stripe
redelivers.

## Charging approved payouts

A cron (`charge approved payouts`, every minute) runs `internal.charging.chargeDue`. It claims
up to 25 approved payouts with `paymentStatus: "notStarted"`, oldest approval first, marks them
`queued`, and schedules `internal.charging.collect` for each. Claiming and scheduling share one
transaction, so a payout is never charged by two runs. Without `STRIPE_SECRET_KEY` it claims
nothing.

`collect` charges one payout:

1. Reads the creator's account from Stripe for `charges_enabled`, since the stored status tracks
   payouts, not charges. If Stripe refuses access, the account is marked `disconnected`.
2. Starts the attempt (see above), or records why it can't be charged and stops.
3. Copies the company's saved card onto the creator's account and charges it off-session for
   exactly the payout's `amount`. Both requests are keyed by the attempt (`payment:<id>:card`,
   `payment:<id>`).
4. Records the outcome from Stripe's response; the webhook later reports the same outcome,
   which is then a no-op.

| Outcome                                                                 | Attempt                               | Payout `paymentStatus` |
| ----------------------------------------------------------------------- | ------------------------------------- | ---------------------- |
| Charge succeeded                                                        | `succeeded`, fee recorded via webhook | `transferred`          |
| Card declined                                                           | `failed`, issuer's reason             | `needsAttention`       |
| Company has no saved card                                               | `failed`, `company_card_missing`      | `needsAttention`       |
| Creator's account can't accept charges                                  | `failed`, `creator_not_ready`         | `needsAttention`       |
| Open dispute on the assignment                                          | `failed`, `payout_disputed`           | `needsAttention`       |
| Creator has no Stripe account (shouldn't happen: applying requires one) | none, error logged                    | `needsAttention`       |
| Outcome unknown (e.g. network error)                                    | stays `processing`                    | `processing`           |

An unknown outcome is retried up to 3 times, a minute apart, with **the same attempt and keys**,
so Stripe returns the original charge if it made one and can never charge twice. Payouts that
need attention, and attempts still unresolved after the retries, are left for recovery (next
PR); the charging run never retries them itself, so they can't hold up other payouts.

Creators absorb Stripe's processing fees on these charges, since the charges are made on their
Standard accounts.

### Trying it end to end

There's no committed way to create a payout yet. To test on your dev deployment, add a
temporary internal mutation that builds a campaign, opportunity, assignment, approved
submission, verified post, and payout through the models (`createCampaign`,
`createOpportunity`, `createPayout`), then approve the payout. **Don't commit it.** Within a
minute the cron charges the company's saved card on the creator's account. Verified in the
sandbox:

- a US$5.00 payout to a Canadian test account → `transferred`, fee CA$0.70, net CA$6.44;
- Stripe's always-declining test card → `needsAttention`, `generic_decline`;
- a company with no saved card → `needsAttention`, `company_card_missing`, no charge made.
