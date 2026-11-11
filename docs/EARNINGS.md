# Earnings rules and payment contract

This is the implementation contract for Tomoji's earnings calculator, scheduler,
and Stripe integration. The calculator and internal settlement operation record
earned obligations through the existing [payout operations](BACKEND.md#payout-records).
Scheduling state and lifecycle hooks are implemented; the recurring earnings
runner and Stripe collection are follow-up work. Creating or approving an
obligation does not charge a company or pay a bank account.

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

A later period with a reliable baseline and cutoff can settle the cumulative
variable earnings that earlier periods left pending. Its calculation records the
earliest covered period and links the earlier pending records to the covering
calculation. This does not turn a day-14 observation into day-seven evidence.
Reconciliation problems require review rather than being covered automatically.

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

The implementation separates the agreement, measurement evidence, and settlement
record:

| Table                 | Purpose                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deliverableEarnings` | One agreement per assignment/deliverable: original post, ownership, compensation, policy version, verification start, window end, and any view-attribution hold or removal cutoff. |
| `postViewSnapshots`   | Immutable view counts with the actual observation time, source key, and receipt time.                                                                                              |
| `earningCalculations` | Period/component inputs and results, pending or reconciliation reasons, and linked payout or covering calculation. A pending calculation is not an additional obligation.          |
| `earningsSchedules`   | Mutable due time and attempt diagnostics for one agreement; calculation records remain authoritative for settled and pending periods.                                              |
| `payouts`             | The earned obligation and its review/payment progress. New records also retain the deliverable ID derived from the source post's submission.                                       |

The [verification operation](../convex/models/posts.ts) stores `firstVerifiedAt`
and initializes the agreement in the same transaction. `postedAt` remains the
publication time. [Cancellation](../convex/models/assignments.ts) stores
`cancelledAt` and atomically records that cutoff on each earnings agreement, keeping
an earlier removal cutoff if one exists. The read is bounded by the 20-deliverable
limit; excess agreements reject the cancellation rather than partially updating
them. Confirmed removal records `removedAt` and its source key; a delayed report
can shorten an existing cancellation cutoff. Neither operation cancels previously
earned obligations. Reverification and replacement
preserve the original agreement, fixed fee, cap, and clock; uncertain attribution
holds variable earnings for reconciliation.

Record missing timestamps/evidence explicitly during rollout. Do not backfill
verification time from publication time or infer historical view counts from
today's total. Preserve records needed to settle an outstanding obligation even
when the assignment is cancelled or the external post is removed.

Existing records can lack these optional timestamps and the payout deliverable
ID. Reverification of a legacy post with unknown timing does not start a new
window. Settlement checks legacy payout relationships when summing existing
obligations; missing relationships or a history beyond the bounded read limit
require reconciliation rather than a partial total. No speculative backfill or
automatic data migration is performed.

Genuinely new posts record `earningsTrackingVersion: 1`; replacement links inherit
that marker and any known
original verification time. Without the marker, an original verification time,
or an existing agreement, verification succeeds but marks earnings timing unknown
and leaves earnings on hold. This also holds never-verified legacy posts until
their history is reviewed, because the old records cannot distinguish them from
posts unverified before tracking began. The initialization operation enforces the
same guard. Do not infer verification from publication time or historical view
counts from today's total. No automatic backfill or data migration is performed.

Before enabling automatic earnings for these legacy posts, a Tomoji admin must
review the available evidence and record the reviewer, source evidence, and
determination of the original verification time, including any unresolved gaps.
A separately approved, evidence-backed conversion plan must establish the earning
window and first due settlement using the rules above. If the original time
cannot be established, leave the case unresolved for a product decision; do not
substitute publication time or a new verification date. Preserve existing
obligations throughout. This contract does not introduce a correction endpoint
or authorize an automatic historical backfill.

## Internal operations

These operations are server-only. They do not accept a client-selected payout
amount or expose new public earnings endpoints.

| Operation                               | Inputs and effect                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal.earningSources.recordViews`   | `{ postId, observedAt, views, sourceKey }`: persist trusted observation evidence. Identical retries return the original snapshot; changed evidence under the same key or a competing key at the same timestamp conflicts. |
| `internal.earningSources.recordRemoval` | `{ postId, removedAt, sourceKey }`: record a confirmed removal cutoff. This is not called automatically on a failed metrics request.                                                                                      |
| `internal.earnings.settle`              | `{ assignmentId, deliverableId, periodIndex }`: calculate and record one due period atomically. Indices start at zero; the default 30-day window has indices 0–4.                                                         |

Settlement reads the stored agreement, timing, observations, and all relevant
existing obligations. It saves the calculation and creates any positive payout
in one mutation, so failure rolls back both. Zero increments create calculation
progress without a payout. Future periods return `notDue`; periods beyond a
cutoff return `outsideWindow`. Unresolved evidence and reconciliation return
`pendingMetrics` or `needsAttention` with a reason. Repeated completed settlements
return the original calculation and payout IDs.

Invoke due periods in order. A later period can cover earlier attempted periods
that are waiting only for metrics; it cannot skip an unattempted period or
silently resolve an accounting problem. The next PR's scheduler will discover due
periods and invoke this operation; there is no earnings cron in this PR.

The existing `posts.updateViews` operation also records a snapshot at server
receipt time; engagement-only updates do not create view evidence. A collector
that knows the actual observation time should use `recordViews`, especially for
delayed evidence. Settlement uses measurements at the stored verification and
cutoff times; a nearby observation is not automatically an exact boundary. Live
X collection must supply this evidence; fixture tests do not prove its availability.

Regressing counts within the eligible window hold variable earnings for
reconciliation. Confirmed removal, including an identical retry, rechecks
metric-regression holds within the shortened window. A hold clears only after
the complete eligible history is checked and no decline remains. The read is
capped at 1,000 observations; longer histories retain the hold for reconciliation.
Observations received while held are still stored and included in that recheck.
Replacement and verification-change holds never clear automatically; any future
resolution operation must revalidate the retained view evidence before releasing
variable earnings.

## Scheduling state

[`earningsSchedules`](../convex/schemas/earningsSchedules.schema.ts) has one row
per agreement, enforced transactionally through `by_earningsId`. Verification
initializes it in the same mutation as the agreement, due at the first weekly
boundary or earlier cutoff. The stored start and end are reused; initialization
retries, reverification, and replacement preserve an existing schedule unchanged.

`status` is `scheduled`, `needsAttention`, or `complete`. A scheduled row has
`nextCheckAt`; parked rows omit it. The future worker will use `by_nextCheckAt`
with `0 <= nextCheckAt <= sweepCutoff` to exclude parked rows and bound due work.
`lastAttemptedAt`, `lastAttemptedPeriodIndex`, `retryCount`, and `lastError` retain
attempt diagnostics. These fields do not establish that an earning was settled:
a fixed-fee-only payout can still leave variable earnings pending. This layer
initializes `retryCount` to zero; worker transitions and retry policy belong to
the execution PR.

Cancellation and confirmed removal bring the schedule forward in the cutoff
transaction, preserving an earlier outstanding check and attempt diagnostics.
A shortened window can wake a previously completed or parked schedule. The
same applies when an identical removal retry clears an obsolete metric-regression
hold; a retry that changes neither cutoff nor hold preserves schedule progress. The
worker must reconsider calculation records against the current cutoff rather
than skip to the last attempted period. If the effective cutoff remains the
stored window end, the schedule is unchanged. Cancellation checks every agreement within
the 20-deliverable limit and rejects inconsistent overflow instead of skipping rows.

The [schedule backfill](MIGRATIONS.md#backfill-earnings-schedules) adds
missing schedules in batches from existing agreements, including ones older than
30 days. It preserves existing schedules and obligations. Invalid timing or a
missing assignment parks the new schedule with an explicit reason; legacy posts
without an earnings agreement do not acquire an invented verification date.
Initial due dates can be in the past: the future worker will reconcile existing
calculations idempotently before creating any additional obligation.

This layer does not enqueue settlement jobs or register an earnings cron. Pending
metrics remain eligible for later reconciliation beyond day 30; automatic retry,
completion, and recovery execution are part of the next PR.

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

The calculator/records implementation covers the policy above with pure arithmetic
tests and Convex transaction tests, including retries, missing evidence, and
cutoff handling. Run `just ci` for type checking, linting, formatting, and the full
test suite. Scheduling-state tests cover lifecycle timing, atomic cancellation,
and migration batching/idempotency. The scheduling execution PR will create due
obligations automatically using the same settlement operation and existing
review workflow.

Stripe processing and bank-payout reconciliation remain in the separate Stripe
stack, followed by integration tests across both stacks. This implementation
does not configure a payment provider or run live charges.
