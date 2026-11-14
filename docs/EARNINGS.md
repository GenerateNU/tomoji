# Earnings rules and payment contract

This is the implementation contract for Tomoji's earnings calculator, scheduler,
and Stripe integration. The existing [payout operations](BACKEND.md#payout-records)
record and review earned obligations. Pure earnings arithmetic and period boundaries
are implemented, along with verification state and immutable measurement evidence.
Settlement, scheduled earnings creation, and Stripe collection are follow-up work.

## Agreed payout rules

| Rule                 | Behavior                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start                | The live post's first verification starts that deliverable's earnings clock. Draft approval, publication, and payout approval are different events.                                 |
| Schedule             | Create an earned payout for review every seven days from verification when money is owed.                                                                                           |
| Duration             | Default to 30 days, including a final partial period covering days 28–30. Keep the default configurable in code.                                                                    |
| Fixed fee            | Include it once per deliverable in the first payout. No minimum views are required: a verified post with zero views still earns its fixed fee.                                      |
| Variable earnings    | Pay additional eligible views since the last recorded earnings calculation, using the agreed compensation rate.                                                                     |
| Compensation         | The company sets opportunity terms; calculate from the accepted assignment's stored terms so later opportunity edits do not change the agreement.                                   |
| Cap                  | The cap covers fixed plus variable earnings separately for each deliverable. Three deliverables with a $200 cap can earn $600 total.                                                |
| Review               | Each payout gets 72 hours from its actual creation time. A company admin can approve earlier; automatic approval respects existing dispute holds.                                   |
| Cancellation/removal | Stop new accrual at the cutoff. Settle accrued amounts, including unrecorded earnings from a partial period; existing unpaid payouts remain owed. No automatic refund is triggered. |
| Money                | Use `usd` and integer cents. `payouts.amount` is gross earned compensation before processing fees. The initial Tomoji fee is zero.                                                  |

Let `T` be the original live-post verification time. The normal period boundaries
are `T`, `T + 7 days`, `T + 14 days`, `T + 21 days`, `T + 28 days`, and
`T + 30 days`. Days are elapsed 24-hour durations, not local calendar days. Use
non-overlapping periods with an inclusive start and exclusive end. An earlier
cancellation or removal ends the final period at that cutoff; the next earnings
run settles it when the required evidence is available.

Preserve the original start and applicable window end. Job retries, later
verification changes, replacement links, and edits to the default duration must
not restart an existing deliverable's clock, fixed fee, or cap. Correcting a
verification is not a new earning agreement. If replacement or verification
changes make view eligibility ambiguous, leave that portion unresolved for
review rather than automatically counting both posts.

A job that creates the day-seven payout on day eight still gives it 72 hours from
day eight. The 30-day limit controls accrual, not review, collection, or bank
deposit timing. Open assignment disputes can hold approval beyond its deadline;
the existing [approval rules](BACKEND.md#approval-and-dispute-holds) still apply.

## Calculation defaults

The following are the initial engineering defaults for the calculator, separate
from the product rules above:

- Count views gained during the earning window, using a timestamped baseline at
  verification and measurements for the applicable cutoffs. Exclude views already
  present at verification.
- Pay proportionally per view. `cpmRateCents` means cents per **1,000** eligible
  views, not cents per view or per 100 views. Round cumulative variable earnings
  down to whole cents so fractional cents carry forward across weekly periods.
- Treat the fixed fee as earned at verification and normally include it in the
  first weekly settlement. If cancellation/removal ends the window sooner,
  include any unrecorded fixed fee in that final settlement.

For a verified deliverable with valid compensation and complete metric evidence:

```text
variableEarnedCents = floor(cpmRateCents * cumulativeEligibleViews / 1000)
totalEarnedCents = min(paymentCapCents, fixedFeeCents + variableEarnedCents)
newPayoutCents = totalEarnedCents - previouslyRecordedEarningsCents
```

`previouslyRecordedEarningsCents` includes every existing obligation for that
assignment/deliverable, including pending review, disputed, and failed-collection
payouts. It is not the sum of successful payments. Refunds and payment retries
must not make the calculator earn the same amount again.

Create a payout only for a positive increment. A zero increment advances
calculation progress without inserting a zero-value payout. A negative increment
or a regressing view count requires reconciliation; do not create a negative
payout, erase an existing obligation, or silently reset the baseline. Validate
nonnegative safe-integer inputs and use arithmetic that cannot silently lose
integer precision. Compensation with a cap below its fixed fee is inconsistent:
flag it for correction instead of silently reducing the promised fixed fee.

### Missing metrics

Missing or stale data is not zero views. A newer lifetime count cannot prove how
many views existed at verification, day 30, or removal. Preserve measurement
timestamps and provenance; leave the affected variable amount pending when a
baseline or cutoff cannot be established. A failed X request alone does not
prove that a post was removed.

The known fixed fee must still become reviewable at the first due settlement,
even if view measurements are unavailable. In that case, record the fixed amount
once and retain an explicit pending variable component. When evidence arrives,
settle only the additional variable amount under its own stable earning identity.
Do not change the amount of the original payout or repeat the fixed fee. The
calculation records must distinguish this separate component from a retry of the
original earning. With complete metrics, the first payout combines fixed and
variable earnings normally.

## Pure calculator

[`calculateEarnings`](../convex/lib/earningsCalculator.ts) computes the cumulative
fixed/variable entitlement, applies whole-cent rounding and the per-deliverable
cap, and subtracts previously recorded obligations. Missing view evidence stays
unknown and can still release an unpaid fixed fee. Invalid or regressed inputs
return `needsAttention` instead of a payable amount.

`getEarningPeriod` derives seven-day periods from the stored verification start
and window end, including the final partial period and an earlier cutoff. These
helpers are pure: they do not read the database, create payouts, or send money.

## Inputs and records needed by the calculator

The calculator must retain enough evidence to reproduce each obligation:

| Input              | Required meaning                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | Assignment, deliverable, and source post IDs. Fixed-fee usage, cap usage, and total earnings belong to the assignment/deliverable even if its post changes. |
| Terms              | Accepted fixed fee, CPM rate, cap, USD currency, and the applicable calculation policy/window.                                                              |
| Timing             | Original verification time, fixed period boundaries, and any cancellation/removal cutoff with its source.                                                   |
| Metrics            | Timestamped baseline and cutoff measurements, their source post, and any unresolved measurement gaps.                                                       |
| Prior obligations  | Recorded fixed/variable components and linked payout IDs, independent of collection success.                                                                |
| Calculation result | Eligible view count, fixed/variable breakdown, rounding/cap application, resulting increment, and stable earning identity.                                  |

The implementation stores one `deliverableEarnings` agreement per assignment and
deliverable, with snapshotted compensation, ownership, the original post, and the
verification window. `postViewSnapshots` preserves view counts, actual observation
times, source keys, and receipt times.

The [verification operation](../convex/models/posts.ts) stores `firstVerifiedAt`
and initializes the agreement in the same transaction. `postedAt` remains the
publication time. [Cancellation](../convex/models/assignments.ts) stores
`cancelledAt`; confirmed removal records `removedAt` and its source key. Neither
operation cancels previously earned obligations. Reverification and replacement
preserve the original agreement, fixed fee, cap, and clock; uncertain attribution
holds variable earnings for reconciliation.

Existing records may lack these optional timestamps. Reverification of a legacy
post with unknown timing does not start a new window. Genuinely new posts record
`earningsTrackingVersion: 1`; replacement links inherit that marker and any known
original verification time. Without the marker, an original verification time,
or an existing agreement, verification succeeds but marks earnings timing unknown
and leaves earnings on hold. This also holds never-verified legacy posts until
their history is reviewed, because the old records cannot distinguish them from
posts unverified before tracking began. The initialization operation enforces the
same guard. Do not infer verification from publication time or historical view
counts from today's total. No automatic backfill or data migration is performed.

Calculation records and direct payout linkage are added by the next stacked PR.

## Internal operations

These server-only operations persist trusted evidence:

- `internal.earningSources.recordViews({ postId, observedAt, views, sourceKey })`
  records an immutable observation. Identical retries return the original snapshot;
  changed evidence under the same key or a competing key at the same timestamp
  conflicts. Delayed observations do not rewind the post's latest metrics.
- `internal.earningSources.recordRemoval({ postId, removedAt, sourceKey })`
  records a confirmed removal cutoff. A failed metrics request alone does not
  establish removal.

The existing `posts.updateViews` operation also records a snapshot at server
receipt time; engagement-only updates do not create view evidence. A collector
that knows the actual observation time should use
`recordViews`, especially for delayed evidence. Regressing counts within the
eligible window hold variable earnings for reconciliation. Confirmed removal,
including an identical retry, rechecks metric-regression holds within the shortened
window. A hold clears only after the complete eligible history is checked and no
decline remains. The read is capped at 1,000 observations; longer histories retain
the hold for reconciliation. Replacement and verification-change holds remain.
Live X collection must
supply verification and cutoff evidence; fixture tests do not prove its availability.

Before enabling automatic earnings for these legacy posts, a Tomoji admin must
review the available evidence and record the reviewer, source evidence, and
determination of the original verification time, including any unresolved gaps.
A separately approved, evidence-backed conversion plan must establish the earning
window and first due settlement using the rules above. If the original time
cannot be established, leave the case unresolved for a product decision; do not
substitute publication time or a new verification date. Preserve existing
obligations throughout. This contract does not introduce a correction endpoint
or authorize an automatic historical backfill.

## Earnings-to-payment handoff

The existing internal operation is:

```text
internal.payouts.create({
  assignmentId, sourceKey, amount, currency, postId, earningPeriod?
})
```

It derives creator/company/campaign ownership from the assignment, checks the
post relationship, and returns the payout document. The earnings workflow uses
`currency: "usd"`, supplies the finalized increment in cents, and retains the
returned `_id` as `payoutId`. The generic existing operation's currency validator
is broader than the MVP's USD-only earnings policy.

An earning identity describes an assignment/deliverable, period, and component
being settled; it does not describe a job run or payment attempt. Generate a
stable `sourceKey` from that identity and persist the original calculation inputs.
Within an assignment, an identical retry returns the existing payout. A changed
amount, currency, post, or period under that key conflicts. Reconcile that
conflict rather than inventing a new key for the same earning. Prior-obligation
accounting and creation must be atomic so concurrent runs cannot record the same
earnings under different keys.

| Earnings implementation (Eric)                                                                           | Stripe implementation (Gulnas)                                                             |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Calculate earnings and create obligations using the existing payout API.                                 | Collect approved obligations, referring to the existing `payoutId`.                        |
| Own period boundaries, calculation evidence, fixed-fee/cap accounting, and earning deduplication.        | Own Stripe account/payment IDs, payment attempts, fees, and payment-status updates.        |
| Preserve accrued earnings through cancellation and leave existing amounts intact after payment failures. | Retry/reconcile collection against the same obligation without charging twice.             |
| Build earnings and payment UI against agreed inputs and callbacks.                                       | Define the setup/recovery operations and responses before those UI tickets are integrated. |

Before collection, the payment executor checks approval, current assignment
disputes, and payment readiness. Cancellation alone must not block collection of
already-earned amounts. The initial collection amount is `payouts.amount`, with
no Tomoji fee or fee gross-up. Record actual processing fees and creator net
receipts separately; do not rewrite the earned amount to match the net deposit.

Approval does not send money. `paymentStatus: "transferred"` and `transferredAt`
describe collection into the creator's provider balance, not a bank deposit or a
requirement to use a separate Stripe Transfer. Bank payouts and failures are
separate payment-provider events; a bank-payout failure cannot trigger another
charge to the company.

Each engineer branches independently from `main`. Gulnas can test against the
existing payout records without importing code from Eric's branch. New Stripe
records and endpoints belong to her stack; detailed UI response contracts are
agreed before the UI tickets. Existing payout authorization remains enforced.

## Acceptance examples

Amounts below are gross USD earnings before processing fees. For one deliverable,
use a $100 fixed fee, $10 per 100 eligible views (`cpmRateCents: 10000`), and a
$200 cap. View counts are gains since verification, with reliable measurements
at each boundary:

| Day after verification | Cumulative eligible views | Total earned | New payout for review |
| ---------------------- | ------------------------: | -----------: | --------------------: |
| 7                      |                       100 |         $110 |                  $110 |
| 14                     |                       300 |         $130 |                   $20 |
| 21                     |                       600 |         $160 |                   $30 |
| 28                     |                       900 |         $190 |                   $30 |
| 30                     |                     1,200 |         $200 |                   $10 |

Every new payout gets its own 72-hour review from actual creation. Three
deliverables following this example earn $600 total, each on its own clock.

| Scenario                                                                                 | Expected result                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero views throughout                                                                    | $100 at day seven; no further payouts. The fixed fee has no view threshold.                                                                                            |
| Cap reached at day seven with 1,000 eligible views                                       | Record $200 once; later views create no additional earnings, even if collection of that $200 is still pending.                                                         |
| No metric response at day seven                                                          | Record the known $100 fixed fee once; keep variable earnings pending, not zero. If reliable evidence later establishes 100 eligible views, only $10 remains to record. |
| Cancellation on day ten after $110 was recorded, with 300 eligible views at cancellation | Record the remaining $20 for review, even if the earlier $110 has not been collected. No later accrual or automatic refund.                                            |
| Removal on day three with 100 eligible views and no prior payout                         | Final settlement is $110, including the fixed fee, once cutoff evidence is available.                                                                                  |
| First $110 collection fails                                                              | The obligation remains $110 owed. At 300 eligible views, the next earning is still only $20; collection retries use the original payout.                               |
| Repeated job for the same earning                                                        | Return the original payout without resetting its review deadline or recording another obligation.                                                                      |
| Day-seven job runs on day eight                                                          | Settle only the first period's supported earnings; the full 72-hour review begins on day eight. Do not count day-eight views as day-seven evidence.                    |
| Replacement/reverification                                                               | No new fixed fee, cap allowance, or 30-day window. Resolve ambiguous view attribution before recording additional variable earnings.                                   |
| Fractional cents                                                                         | At 1 cent per 1,000 views, 600 eligible views accrue 0 payable variable cents; 1,200 accrue 1 cent. Weekly rounding must not discard the earlier fraction.             |

## Delivery and verification

The pure calculator is covered by unit tests for fixed fees, cumulative CPM, caps,
rounding, missing metrics, invalid inputs, and period boundaries. Run `just ci`
for type checking, linting, formatting, and the full test suite.

Lifecycle transaction tests also cover verification, replacement, cancellation,
removal, immutable retries, delayed metrics, and regressing counts. The next
stacked PR adds transactional settlement records. Scheduling and Stripe
processing remain follow-up work.
No payment-provider configuration or live charges are introduced here.
