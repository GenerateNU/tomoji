# Backend

This document covers how we structure and write Convex code. Setup instructions and common commands live in `CONTRIBUTING.md`.

Shared S3 media configuration and upload guarantees are documented in [S3 media foundation](S3.md).

Linked X account storage and credential handling are documented in [X accounts](X_ACCOUNTS.md).

## Layout

Convex maps the **file path directly to the API path**. For example, a function exported from `convex/creators.ts` is called as `api.creators.<name>`. There is no separate router because the filename itself defines the namespace.

```text
convex/
  schema.ts            assembles the tables
  schemas/             one file per table: fields + indexes
  <domain>.ts          route layer: args, returns, calls models/
  models/<domain>.ts   data layer: db reads/writes, business rules
  migrations/          dated migration definitions + ordered runner
  lib/                 shared utilities: errors, auth helpers, function builders
  tests/               unit/integration tests, file structure mirrors the source tree
  auth.ts              WorkOS webhook handlers
  http.ts              HTTP routes, currently only used for webhooks
```

**Keep route files thin.** They should validate arguments and delegate the actual work to the model layer. Database access and business rules for application routes belong in `models/`. This makes the logic easier to test directly and allows it to be reused by other routes without creating circular imports. One-time migration logic lives in `migrations/` instead.

**Keep dependencies flowing in one direction:** `<domain>.ts` → `models/`. Models should never import from route files or call routes through `ctx.runQuery(api.…)`. If a model seems to need something from a route, that usually means the logic belongs lower in the stack and should be moved into the model layer. Models can depend on other models when needed, such as the creators model reading from users, as long as those dependencies stay acyclic.

Each dated migration file contains its transformation logic, helpers, and types,
using the shared `migrations` instance in `migrations/runner.ts`. Migrations can
reuse model helpers for shared domain rules. Register dated migration functions
in `migrations/runner.ts` in execution order. See [Database migrations](MIGRATIONS.md)
for running, checking, and adding migrations.

## Queries, mutations, and actions

Choose the function type based on what it needs to do:

| Function   | Reads DB           | Writes DB             | External HTTP | Transactional |
| ---------- | ------------------ | --------------------- | ------------- | ------------- |
| `query`    | yes                | no                    | no            | yes           |
| `mutation` | yes                | yes                   | no            | yes           |
| `action`   | through `runQuery` | through `runMutation` | yes           | **no**        |

Anything that calls an external API should be an action. Actions do not have access to `ctx.db` directly. They interact with the database through `ctx.runQuery` and `ctx.runMutation`.

**Actions are not transactions.** If an action calls an API and then writes to the database, it can fail somewhere between those steps. The API call may succeed while the write never happens, or the write may succeed before something later fails.

Keep the database work in a single mutation near the end whenever possible so that the write either fully commits or does not happen at all. Actions should also be safe to retry. Running the same action twice should not send a second invitation or create a duplicate row.

**Authorize inside the action itself, not only inside a mutation it calls.** An action may perform external side effects before that mutation runs. If authorization happens afterward, it is already too late to stop something like an email from being sent.

## Public vs. internal

`query`, `mutation`, and `action` create **publicly callable functions**. Any client with access to the application can attempt to invoke them with their own arguments.

`internalQuery`, `internalMutation`, and `internalAction` are only callable by other server-side Convex functions.

Default to internal for anything that is not intentionally part of the public API. This includes webhook helpers, functions called by actions, and scheduled jobs. A function should be public because we intentionally chose to expose it, not simply because we forgot to make it internal.

`bunx convex function-spec` shows what is actually deployed and whether each function is public or internal. It is worth checking before opening a PR.

## Authorization

`lib/functions.ts` exports function builders that verify the caller's account type before the handler runs:

| Builder                                        | Caller must be                                      | Extra context                                                          |
| ---------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `authedQuery` / `authedMutation`               | any signed-in user                                  | `ctx.user`                                                             |
| `creatorQuery` / `creatorMutation`             | a creator                                           | `ctx.user`                                                             |
| `companyQuery` / `companyMutation`             | a company user                                      | `ctx.user`, `ctx.orgId`, `ctx.membership`                              |
| `companyAdminQuery` / `companyAdminMutation`   | a company **admin**                                 | same as `companyQuery`                                                 |
| `companyScopedQuery` / `companyScopedMutation` | a company user, or an operator naming a `companyId` | `ctx.user`, `ctx.companyId`, `ctx.membership` (`null` for an operator) |
| `operatorQuery` / `operatorMutation`           | a Tomoji operator                                   | `ctx.user`                                                             |
| `operatorAction`                               | a Tomoji operator                                   | `ctx.user`                                                             |
| `creatorAction`                                | a creator                                           | `ctx.user`, `ctx.creatorId`                                            |
| `companyAdminAction`                           | a company **admin**                                 | `ctx.user`, `ctx.membership`, `ctx.orgId`                              |

Actions have no `ctx.db`, so the action builders run the same check through an
internal query in `convex/authorize.ts` first. That keeps an action from being looser
than the query or mutation it mirrors.

Use these instead of the raw `query` and `mutation` functions. It proves the caller is signed in, synced, active, and of the right account type. Note that additional access checks may be necessary to ensure that sensitive company/creator data is not leaked beyond role checks.

Authorization should always happen on the server. Never accept a `userId` from the client to determine what someone is allowed to do. Derive the caller's identity from `ctx` instead.

For application, assignment, submission, and payout reads, `requireCallerViewer` in
`lib/functions.ts` resolves the caller to the shared `ResourceViewer` ownership scope.
`canViewResource` checks creator/company ownership; domain `require…` helpers still
own missing-row errors and resource-specific rules. Do not apply that ownership policy
to opportunity discovery or private media reads, which have different visibility rules.

## Accounts, invites, and the operator org

Nobody signs themselves up. An operator sends a WorkOS invitation, and the account
appears when it is accepted. Which WorkOS organization the invitation names decides
what the person becomes:

| Organization on the invite                  | Account                       |
| ------------------------------------------- | ----------------------------- |
| none                                        | creator                       |
| `WORKOS_OPERATOR_ORG_ID`                    | Tomoji operator               |
| any other org we have a `companies` row for | company user, admin or member |
| an org we have never seen                   | ignored                       |

That last row matters: the `companies` row has to exist before the invitation is sent,
which is why `invites.inviteCompany` creates the organization and the company row before
calling WorkOS. That ordering makes it the one route here that is not safe to retry — a
second call makes a second organization. When the invite is what failed, the error carries
the `companyId` it already created so the caller can finish with `invites.inviteCompanyUser`
instead of starting over.

The routes in `convex/invites.ts` only call WorkOS. Every write happens in the
`invitation.*` webhook handlers in `convex/auth.ts`, so the `invites` table reflects
what WorkOS actually did rather than what we asked it to do. Revoking, for the same
reason, leaves the row alone and waits for `invitation.revoked`.

`WORKOS_OPERATOR_ORG_ID` is a deployment setting, not a hardcoded id, because staging
and production are separate WorkOS environments with different organizations. When it
is unset, no org is the staff org and `isOperatorOrg` is always false, so a staff
invite quietly creates an ordinary company instead.

## Errors

Throw `apiError(code, detail)` from `lib/errors.ts` instead of using `new Error()`.

Convex redacts normal error messages in production, so the client would only receive `"Server Error"` and the useful message would be lost.

Only add a new error code when the caller would actually respond to it differently. For example, `not_found` intentionally covers both "this doesn't exist" and "this isn't yours." The client should not be able to distinguish between those cases.

## Naming routes

- **Do not repeat the domain name.** Use `campaigns.create`, not `campaigns.createCampaign`. The namespace already tells us it is a campaign.
- **Use standard CRUD names:** `get`, `list`, `create`, `update`, and `remove`. It has to be `remove` rather than `delete`, which is a reserved word and cannot be an export name.
- Use **`me` when the row represents the current caller**, such as `creators.me`.
- Use **an optional ID when the caller owns the resource but may access others they own**. For example, `companies.get` takes an optional `companyId` and omitting it means "my own."

A route should only get its own name when it returns or does something meaningfully different. If two routes only differ based on who is calling them, they should usually be one route because the builder already captures the caller type.

## Naming model functions

Model functions are imported directly, so their names should make sense on their own at the import site. This is different from routes, where the filename already provides the domain. For example, a `create` route in `campaigns.ts` would call a model function named `createCampaign`.

| Prefix                            | Returns                 | Use when                                                                              |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `get…`                            | the row, or `null`      | it is normal for the row not to exist and the caller can handle that                  |
| `list…`                           | an array or page        | reading multiple rows                                                                 |
| `require…`                        | the row, or throws      | the row must exist for the operation to continue (e.x. auth)                          |
| `create…` / `update…` / `remove…` | the result of the write | creating, updating, or removing a row                                                 |
| `upsert…`                         | the result of the write | creating or updating a row in one operation, such as provider sync or account linking |

Use the table name as the subject of the function instead of introducing a different term for the same thing. This keeps naming consistent from the schema to the model and route layers. Only add `By<Field>` when the table supports multiple lookups and the function name would otherwise be unclear. In most cases, the arguments already make it obvious what field is being matched.

## Opportunity deadlines

Opportunity deadlines are Unix milliseconds on exact UTC half-hour boundaries
(`:00` or `:30`, with zero seconds/milliseconds). Create, update, publish, and resume
reject off-grid deadlines rather than rounding them. Deadline closure runs at those
same boundaries through the internal cron, in bounded batches; drafts do not auto-close.

Campaign end dates and offer expiries share `isHalfHourTimestamp` and `HALF_HOUR_MS`
from `lib/validation.ts`. Callers retain their own optionality, future-time checks,
and error reasons.

## Opportunity recommendations

`opportunityScores` stores how well an open opportunity fits a creator, from 0 to 1.
`scoreOpportunityMatch` weighs the opportunity's minimum follower range (0.45), skills
(0.35), and niches (0.20) against the creator's profile. Signals the opportunity
doesn't ask for are left out and the rest re-normalized.

Follower ranges are self-reported (`creators.followerRange`,
`opportunities.minFollowerRange`; `null` clears them). They're uneven, so
`followerRangeFit` measures the shortfall on a log scale: the score drops by 1 for
every 10x a creator falls short. A minimum ranks a brief lower but never hides it.

Only matches are stored; no row means a score of 0. The internal mutations
`opportunityScores.scoreOpportunity` and `scoreCreator` rebuild scores in bounded,
self-scheduling batches: first rescoring existing rows, then one stage per shared
niche or skill (named, not numbered, so edits between batches don't misdirect them).
Both read candidates through the `by_name_and_*Id` selection indexes, so cost grows
with matches, not with every creator or opportunity; a brief that only sets a
follower minimum has no selections to look up and isn't scored. Both skip users who
aren't active creators. Open and paused briefs keep their scores, so pausing and
resuming a brief or campaign needs no rescoring; drafts and closed briefs have none.

Routes schedule the jobs after the write commits:

- `opportunities.create` (open, with niches or skills), `publish`, and `update` of
  niches, skills, or `minFollowerRange` rescore the opportunity.
- `opportunities.close` and the deadline cron clear a closed brief's scores, when it
  has any.
- `creators.update` of niches, skills, or `followerRange` rescores the creator.

Briefs published before scoring existed are scored by the
`2026_11_14_score_open_opportunities` migration.

`opportunities.discover` lists the caller's matches first, best first, then every
other open brief by deadline. Its cursor is a JSON `[section, cursor]` pair that
names which list it continues. Visibility (paused briefs or campaigns, inactive
companies) is checked as the feed is read, so stale scores never show.

## Opportunity deliverables

A deliverable is one piece of content an opportunity asks every assigned creator
to make (title and description). They are rows in `deliverables`, listed in the
order they were added, at most 20 per opportunity.

- An opportunity can't be open without one: `opportunities.create` with
  `status: "open"` needs inline `deliverables`, `publish` refuses a draft with none,
  and `deliverables.remove` keeps the last one of a published opportunity.
- Once the opportunity has an assignment, in any status, its deliverables can't be
  edited or removed, so the work a creator agreed to never changes under them and
  their drafts keep pointing at real rows. New deliverables can still be added.
  There is no copy on the assignment.
- Creators see them for opportunities they can discover, and for ones they're
  assigned to even after those pause or close.

`models/deliverableDrafts.ts` holds the row rules that `models/opportunities.ts`
also needs; `models/deliverables.ts` holds the route rules and depends on
opportunities, which keeps the imports acyclic.

### Submissions and posts per deliverable

Every submission names the deliverable it's a draft for (`deliverableId`,
required), which must belong to the assignment's opportunity; any other is
`not_found` with resource `deliverable`. The submission rules apply to each
deliverable separately:

- One pending draft and one approved draft per deliverable. Approval is final for
  that deliverable while the creator keeps submitting the others.
- `submissions.list` always takes a `deliverableId` and returns that
  deliverable's drafts newest first. There is no assignment-wide list; read
  drafts through `by_assignmentId_and_deliverableId`.
- Each approved deliverable has at most one active post. `posts.list` by
  assignment returns every active post on it in one page, newest first, which
  the 20-deliverable cap keeps bounded.

Public post reads and mutation responses use the explicit `postView` projection.
They include verification/removal times and caption-check status, but omit earnings
tracking markers, removal evidence keys, and the in-flight caption reservation.
Internal operations retain the full stored post for reconciliation.

`deliverableId` is required with no migration, since nothing is deployed yet. A
dev deployment holding submissions from before it won't accept the schema:
clear its `submissions`, `posts`, and `disputes` tables, then push again.

## Creator applications table

`applications.searchMine` feeds the creator's Applications page: one page of rows plus a
count for each tab. It is a creator-only query; the creator always comes from the caller.

- **Tabs.** `APPLICATION_TAB_STATUSES` maps every status to one tab. Applications lists
  `pending`, `rejected`, and `opportunityFull`; Offers lists `offered`, `offerExpired`, and
  `declined` (declined offers stay in Offers); Accepted lists `accepted`. The `tab` argument
  accepts `applications`, `offers`, or `accepted`. The result echoes `tab` so the client can
  tell which tab's rows it holds. "Hide rejected" hides `rejected` and `opportunityFull` (applications
  closed because the opportunity filled) and does nothing on Offers or Accepted. The status
  sort groups those two together, then falls back to newest submitted, then `_id`.
- **Read budget.** Each count reads at most `MAX_APPLICATIONS_READ` (300) applications,
  newest first within each status, and the applications tab's statuses share that budget.
  Search, filters, sorting, and paging then run in memory over those rows. A count that
  reaches its limit reports `isCapped: true`, and the UI shows "300+". Counts ignore the
  search and filters; `totalCount` is the filtered total. The requested tab's count is its
  joined rows (applications whose opportunity was deleted are skipped); the other tabs count the
  raw rows read, so they can include rows that would be skipped.
- **Arguments.** `page` is an integer from 1 and a page past the end is clamped to the last.
  `pageSize` is an integer from 1 to 50 and the search is trimmed to at most 100
  characters. Violations are `invalid_state` with reason `invalid_page`,
  `invalid_page_size`, or `search_too_long`. Each tab has its own default sort: Applications
  newest submitted first, Offers by `expires` ascending, Accepted by `accepted` descending
  (most recently accepted first). Ties always fall back to newest first.
- **Offer expiry.** Offer rows carry `offerExpiresAt` (absent when unset). The `expires`
  sort keeps a fixed group order whatever the direction (`offered`, then `offerExpired`,
  then `declined`) and sorts by `offerExpiresAt` within a group in the requested direction;
  offers without an expiry come last in their group.
- **Offer acceptance.** Accepted rows carry `offerAcceptedAt` (absent when unset). The
  `accepted` sort orders by it in the requested direction; a row without it comes last in
  both directions, and ties fall back to newest submitted, then application id.
- **Rows keep their details after an opportunity closes.** A row reads the opportunity and
  company directly rather than through `requireOpportunity`, so a closed, paused, or
  inactive-company opportunity still shows its title, company, and pay. `canStar` says
  whether creators can still see it, because starring a hidden opportunity is refused
  (`not_found`) while unstarring always works. A row whose opportunity was deleted is
  skipped, and a missing company shows an empty `companyName`.
- `submittedAt` is the application's creation time. Company logos are private media, so the
  row returns `companyLogoMediaId` and the client loads it with `media.getCompanyMedia`.

### Offer details (`applications.getMineDetail`)

`applications.getMineDetail({ applicationId })` is a creator-only query returning one of
the caller's applications with its opportunity brief (`creatorOpportunity`, including
`companyName`, with niches, skills and languages as names), `offerExpiresAt`,
`offerAcceptedAt`, `companyLogoMediaId`, `minFollowerRange`, and `termsRequired`.

- **Ownership.** Another creator's application, a missing one, and one whose opportunity was
  deleted are all `not_found`. A missing company gives an empty `companyName`.
- **Reads closed offers.** Like table rows, it reads the opportunity directly, so a closed,
  paused, or inactive-company opportunity still shows its brief to its applicant. It works
  for any application status.
- **Flags leave out the clock.** `canAccept` is true when the status is `offered` and the
  opportunity is `open` or `paused` with a free slot; `canDecline` is true whenever the status
  is `offered`. `acceptBlockedReason` (`opportunity_closed` or `opportunity_full`) is set only
  on an offered application that can't be accepted, and matches the `invalid_state` reason
  `acceptApplication` throws. Queries must not call `Date.now()`, so an offer past its expiry
  that the cron has not yet marked `offerExpired` still reports `canAccept: true`; the client
  compares `offerExpiresAt` to its own clock and `accept` refuses with `offer_expired`.
- **Follower range.** `minFollowerRange` is the stored enum value; the client labels it.
- **Terms.** `termsRequired` is true when the opportunity's `reviewPolicy` is not blank
  after trimming (`hasReviewPolicy`), for any application status. The terms text shown to
  the creator is `opportunity.reviewPolicy`.

### Accepting an offer (`applications.accept`)

`applications.accept({ applicationId, acceptedTerms? })` returns
`{ application, assignmentId }`. When the opportunity has a review policy, `acceptedTerms`
must be `true`, otherwise it fails with `invalid_state` and reason `terms_not_accepted`; the
argument is ignored when the policy is blank. Checks run in this order: `not_found`,
`application_not_offered`, `offer_expired`, `opportunity_closed` or `opportunity_full`, then
`terms_not_accepted`. `createAssignmentFromOffer` re-checks and can still throw `conflict`
(`already_assigned`).

In one transaction the call marks the application accepted, takes a slot, and creates the
assignment already `active` with `termsAcceptedAt` set to the acceptance time, and sends a
single `applicationAccepted` notice (no `assignmentTermsAccepted`). Only claimed (ungated)
assignments start `termsPending`, so `assignments.acceptTerms`, `declineTerms` and `cancel`
apply only to those; on an accepted offer's assignment they fail with
`assignment_not_pending`. Declining an offer is `applications.decline`.

## Payout records

The [earnings rules and payment contract](EARNINGS.md) defines the calculator's
verification clock, fixed/variable earnings, cutoffs, and handoff to Stripe
collection. Its [internal operations](EARNINGS.md#internal-operations) record
measurement evidence and settle one due period.
Its [scheduling state](EARNINGS.md#scheduling-state) tracks due work through
verification and cutoffs. The minute cron discovers due work in pages of 25;
isolated workers settle missed periods, retry missing evidence, and park failures
for attention. See [execution and recovery](EARNINGS.md#scheduled-execution-and-recovery).
This section describes the payout operations those settlements use.

Public [`earnings.get` and `earnings.listCalculations`](EARNINGS.md#earnings-detail-and-calculation-history-reads)
read a deliverable's agreement and calculation history. Their model is in
`models/earningsHistory.ts`, separate from settlement writes. Access comes from
the agreement's stored ownership, so history survives deleted parents. Calculation
increments are not payment confirmations; unresolved and covered rows add no
payable amount. The existing payout reads provide review and payment status.

`payouts` records individual finalized earning obligations. Every payout identifies
one post and its assignment; both an assignment and a post can have several payouts.
An earning period is optional. Ownership is stored on the payout so historical reads
do not depend on an assignment, campaign, or post remaining active or present.

- `payouts.get({ payoutId })` returns one authorized payout. Missing and inaccessible
  payouts both return `not_found`.
- `payouts.list({ paginationOpts, assignmentId?, campaignId?, approvalStatus? })`
  returns a page ordered by `reviewRequestedAt` descending, then creation time
  descending for ties. Filters combine and only narrow the caller's scope.
  For company callers, filters naming an existing campaign or assignment owned by
  another company return `not_found` before scanning payouts. Missing parents fall
  back to the payout's stored ownership so historical payouts remain readable.
  Creator and operator access is unchanged by parent existence or company ownership.
  Other filters with no visible matching payouts return an empty page. Parent-filtered
  queries cap rows scanned per page, so a short or empty page with `isDone: false`
  must be continued using `continueCursor` and the same filters.
- Creators see their own payouts, company members and admins see their company's,
  and operators can read all payouts. Company scope comes from verified membership;
  callers cannot supply a creator or company ID to override it.
- Both endpoints return an explicit public view, excluding `sourceKey` and
  `approvedBy`. The source key is for internal earning-event deduplication and the
  approver ID is audit metadata.
- `deliverableId` is returned when stored on the payout, including after related
  records are deleted. It remains absent on legacy payouts without a stored ID;
  reads neither infer it from a live post nor backfill historical records.
- Each view includes `review: { hasOpenDispute, canApprove }`. `hasOpenDispute`
  reflects any current open assignment dispute, including one about a different
  post on the assignment. It remains true if a dispute opens after approval;
  that does not revoke the stored approval. `canApprove` is true only for the
  owning company's current admin when the payout is pending and undisputed.
  Creators, company members, and operators receive false. Company scope and
  role come from the caller's verified, active membership, never request input.
- Review enrichment happens after ownership filtering and preserves every row,
  sort order, and native pagination metadata. List reads check disputes once per
  distinct assignment in the returned page. These reads do not write records or
  change deadlines. An overdue payout stays pending until an approval operation
  runs; clients can display the stored `approvalDueAt` without treating elapsed
  time as proof of approval.

Approval and payment status are separate. `transferred` means money reached the
creator's payment-provider balance, not their bank. Times are Unix milliseconds;
`amount` is stored in integer currency minor units (cents for USD, yen for JPY),
alongside `currency`. Renaming the field does not rescale existing monetary values.

### Recording finalized earnings

`internal.payouts.create({ assignmentId, sourceKey, amount, currency, postId,
earningPeriod? })` records a finalized earning and returns the stored payout.
Only trusted backend functions call it; creators, companies, and operators do not
have a public payout-creation endpoint. The caller is responsible for calculating
the earned amount and deciding when it is final.

- Ownership comes from the assignment. The required post must exist and link to
  that assignment through its submission. Parent activity and assignment status
  do not determine whether historical earnings can be recorded.
- `amount` must be a positive safe integer in the currency's minor units.
  Currency is trimmed, lowercased, and checked for three ASCII letters. This is
  format validation; provider-supported currencies and currency-specific payout
  limits belong to the later payment integration.
- An optional earning period must use nonnegative integer Unix milliseconds,
  with `startsAt < endsAt <= reviewRequestedAt`.
- Creation sets `reviewRequestedAt` from server time, `approvalDueAt` exactly
  72 hours later, `approvalStatus: "pending"`, and `paymentStatus: "notStarted"`.
  The deadline is not rounded to the campaign/opportunity half-hour schedule.
- `sourceKey` is a trimmed, nonblank earning-event identifier supplied by the
  trusted earnings caller; `createPayout` does not generate it. The caller must
  reuse the key for every retry of the same earning, including a recalculation
  that changes the amount (which returns a conflict rather than another payout).
  Different earnings on one assignment use different keys. The same key may be
  used on another assignment.
- A single mutation reads the `(assignmentId, sourceKey)` index and inserts the
  payout. This enforces uniqueness transactionally; the index alone is not unique.
  Retrying with the same amount, currency, post, and period returns the existing
  payout without changing its deadline or approval/payment progress. Changed
  details return `conflict` with reason `payout_source_conflict`. Identical retries
  still reconcile after related records have been deleted.

The earnings-calculation workflow generates stable source keys from the stored
earnings agreement, period index, and settlement component. The
[earnings handoff](EARNINGS.md#earnings-to-payment-handoff) defines identity at the
assignment/deliverable level so a replacement post cannot reset the fixed fee or
cap. Keys identify the earning itself, not the attempt: a fresh random key on
each retry would allow duplicate payouts.

This operation records obligations; it does not calculate fixed fees or view-based
earnings, approve payouts, or schedule payments.

### Approval and dispute holds

`payouts.approve({ payoutId })` lets a company admin approve their company's payout.
The route uses `companyAdminMutation`; creators, ordinary members, and operators
cannot approve on a company's behalf. Missing and foreign payouts return
`not_found`. Successful approval returns the same public view as `get` and `list`.
The returned review context reflects the new approved state. A previous read's
`canApprove` value is only a UI hint: the mutation rechecks current membership,
ownership, and open disputes before approving a pending payout. Cancellation or
missing parent records do not independently block review of an existing obligation.

- Manual approval records `approvalStatus: "approved"`, server-time `approvedAt`,
  `approvalSource: "company"`, and the authenticated user's ID in `approvedBy`.
- A minute-interval cron calls `internal.payouts.autoApprove({})`. It scans pending
  payouts with `approvalDueAt <= server time`, approving eligible rows with
  `approvalSource: "automatic"` and no `approvedBy`. The original 72-hour deadline
  is exact; the stored approval happens on a subsequent run, subject to job delay.
- Each transaction scans at most 50 payouts. Cursor continuations keep the initial
  cutoff and advance past held payouts, so a page of disputes cannot starve later
  eligible payouts. A new cron sweep revisits any remaining pending payouts.
- Any open dispute on the assignment blocks a new approval, including a dispute
  about a particular post. Manual approval returns `invalid_state` with reason
  `payout_disputed`; automatic approval skips the payout. The indexed dispute read
  and approval write happen in the same transaction.
- All assignment disputes must be resolved before approval can proceed. Resolution
  never changes `reviewRequestedAt` or `approvalDueAt`; an overdue payout becomes
  eligible on the next sweep, while a future deadline still has to be reached for
  automatic approval. Resolution does not recalculate the payout amount.
- Already-approved payouts are unchanged on repeated calls, preserving the first
  approval's source, time, and actor even if another dispute is opened later.
  Manual approval and the automatic sweep can safely race; the first approval wins.

Dispute holds are derived from current dispute rows, not copied to each payout.
Approval preserves the amount, deadline, and payment status; it does not send money.
Stripe execution and bank-payout reconciliation remain separate integration work.
That future payment operation must check current disputes again before transferring
funds, including disputes opened after approval.

## Tests

`convex/tests/` should mirror the source tree. For example:

```text
models/users.ts
tests/models/users.test.ts
```

Shared fixtures and testing utilities should stay in `tests/helpers.ts`.

Use `campaignArgs` and `submissionArgs` for shared input fixtures, with explicit
scenario overrides. Expected submission views remain independent of production
serializers. `expectApiError` can assert both code and reason without invoking an
operation twice. Preserve raw inserts for invalid/legacy data and public-route calls
when testing route behavior.

Prefer testing model functions directly with `t.run()`. Use the `api.*` route path when the behavior you are testing specifically involves authorization, argument validation, or route behavior.
