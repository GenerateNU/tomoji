# Database

A quick reference for developers working with Tomoji's current Convex database.
The source of truth is [convex/schema.ts](../convex/schema.ts), which assembles
the table definitions in [convex/schemas/](../convex/schemas/). See
[Backend](BACKEND.md) for route, model, authorization, and testing conventions.

## Tables

There are 11 application tables. WorkOS AuthKit and the migrations component also
manage their own separate data.

| Table           | What it stores                                                                                                                                 | References                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `users`         | Account identity: WorkOS ID, email, first/last name, role, active flag, and profile picture.                                                   | None.                                                                           |
| `creators`      | Creator profile: username, X ID, GitHub link, and phone number.                                                                                | `userId` → `users`.                                                             |
| `companies`     | Organization identity: WorkOS ID, name, active flag, and profile picture.                                                                      | None.                                                                           |
| `companyUsers`  | Company membership and the member's `admin` or `member` role.                                                                                  | `userId` → `users`; `companyId` → `companies`.                                  |
| `campaigns`     | Campaign brief: title, objective, product, audience, description, budget, and schedule.                                                        | `companyId` → `companies`; `createdBy` → `companyUsers`.                        |
| `opportunities` | A campaign's creator opening: eligibility, application/slot limits, deadline, content requirements, default compensation, and review settings. | `campaignId` → `campaigns`; `createdBy` → `companyUsers`.                       |
| `applications`  | A creator's application, note, status, and optional offer expiry/acceptance timestamps.                                                        | `opportunityId` → `opportunities`; `creatorId` → `creators`.                    |
| `assignments`   | A creator's engagement on an opportunity, including agreed compensation, review setting, and status.                                           | `opportunityId` → `opportunities`; `creatorId` → `creators`.                    |
| `submissions`   | Draft URL/description, review status, optional review note, and review attribution.                                                            | `assignmentId` → `assignments`; human `reviewedBy` → `companyUsers`.            |
| `posts`         | Published URL, posting time, verification flag, engagement counts, and last update time.                                                       | `submissionId` → `submissions`.                                                 |
| `disputes`      | Assignment dispute: reason, description, status, and optional resolution.                                                                      | `assignmentId` → `assignments`; `openedBy` and optional `resolvedBy` → `users`. |

## Relationships

- A user account and its creator profile represent the same person. Application
  code maintains at most one creator profile per user. A retained creator profile
  does not by itself mean the account currently has the `creator` role.
- A user can belong to **at most one company** through `companyUsers`. A company
  can have many members. `applyMembership` in [models/users.ts](../convex/models/users.ts)
  enforces the per-user limit when processing membership changes.
- A company can have many campaigns, and a campaign can have many opportunities.
  `createdBy` identifies the company membership responsible for creation.
- Applications and assignments each connect a creator to an opportunity.
  Assignments do not currently store an `applicationId`.
- Assignments group submissions and disputes. Posts reference submissions.

## Data conventions

- Convex supplies each document's `_id` and `_creationTime`. `workosId` is an
  external identity identifier; application references use Convex IDs.
- `v.id("table")` validates an ID's table type. It does not check that the referenced
  document still exists or automatically delete related records.
- Indexes support lookups such as membership by user, campaigns by company, and
  applications by opportunity/status. They are **not unique constraints**; models
  must enforce uniqueness where required. Full index definitions live beside each table.
- `firstName` and `lastName` are required strings. The user model rejects blank or
  whitespace-only first names; an empty last name is allowed. Legacy `users.name`
  is not part of the active schema.
- `username` is optional. New creator profiles can exist without it. The
  profile-update model trims supplied usernames and rejects blank values; it
  does not enforce username uniqueness.
- Timestamps such as `startsAt`, `deadline`, `offerExpiresAt`, and `offerAcceptedAt`
  are Unix milliseconds. Monetary fields use cents; `cpmRateCents` is cents per
  1,000 eligible views. Assignment compensation is stored separately from editable
  opportunity defaults.
- Campaign creation requires a nonnegative safe-integer `budgetCents`, finite
  timestamps, and an `endsAt` strictly after `startsAt` when provided. Workflow
  money/count fields currently use `v.number()`; their range rules and transactional
  maintenance of `numFilledSlots` still need workflow implementations.

## Status and review fields

Statuses are strings validated with `v.union(v.literal(...))`, not a separate enum
data type. These validators restrict allowed values; they do not enforce transitions.

| Table           | Allowed `status` values                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `opportunities` | `draft`, `open`, `paused`, `closed`                                                         |
| `applications`  | `pending`, `offered`, `accepted`, `declined`, `rejected`, `offerExpired`, `opportunityFull` |
| `assignments`   | `termsPending`, `active`, `completed`, `cancelled`                                          |
| `submissions`   | `pending`, `approved`, `changesRequested`                                                   |
| `disputes`      | `open`, `resolved`                                                                          |

Users have an account role of `creator`, `company`, or `operator`. Company membership
roles (`admin` or `member`) are separate from account roles.

Submissions without review attribution must be `pending`. A recorded review requires
`reviewerType` and `reviewedAt`: `ai` reviews have no `reviewedBy`, while `companyUser`
reviews require that membership ID. A reviewed submission can still be `pending`.

## Current implementation

Users, creators, companies, and company memberships have routes, and campaigns have
a creation route. Opportunities, applications, assignments, submissions, posts, and
disputes currently have **schema definitions only**. Their end-to-end workflows,
authorization rules, and state transitions still need to be implemented.

## Migrations

See [Database migrations](MIGRATIONS.md) for commands and completion checks.
Existing records with legacy `users.name` or missing required name fields must
be converted under a compatible deployment before the current schema can deploy.
Keeping backfill functions does not bypass schema validation.

Migrations are registered in [convex/migrations.ts](../convex/migrations.ts), with
transformation logic in [convex/models/migrations.ts](../convex/models/migrations.ts).
After deploying the migration code to your development deployment, run:

```bash
bunx convex run --deployment <dev-deployment-name> migrations:run \
  '{"fn":"migrations:<migrationName>"}'
```

Replace both placeholders with your development deployment and exported migration
name. The runner processes records in batches and tracks progress so interrupted
runs can resume. Deploying the code alone does not execute these backfills.

- Add `"dryRun": true` to preview one batch without saving changes.
- Add `"reset": true` to restart from the beginning, including records added after
  an earlier completed run.
- `backfillUserNames` fills missing name parts from available identity data and
  removes the legacy `name` field. It fails if the resulting first name is blank.
- `backfillCreatorUsernames` fills missing usernames with `creator_<userId>` and
  preserves existing values. It does not change new-account creation behavior.

Both backfills preserve document IDs. Before making username required in a future
change, update write paths, backfill existing records, and verify the data.
