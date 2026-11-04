# Database migrations

Migrations are defined in dated files under [convex/migrations/](../convex/migrations/)
and registered in [runner.ts](../convex/migrations/runner.ts), which also exports
the shared `migrations` instance. Each dated file contains its migration-specific
transformation logic, helpers, and types.
The runner processes records in batches and tracks progress; deploying the code
alone does not run a migration.

## Before running

Use your personal development deployment configured in `.env.local`
(`CONVEX_DEPLOYMENT=dev:...`), without a deployment-key override.

The user-name migration is finished. `users.name` is gone, and `firstName` and
`lastName` are required in both the schema and the profile response validators,
so the schema no longer accepts an unmigrated user row. User sync writes both
parts, using the account email for a missing or blank first name and `""` for a
missing last name.

A deployment that still holds legacy rows will have its schema push rejected, and
the backfill that fixed those rows has been removed. See
[Recovering an unmigrated deployment](#recovering-an-unmigrated-deployment).

The creator profile rework drops `username`, `xId`, and `phoneNumber` from
`creators`, also without a migration. See
[Dropping the legacy creator columns](#dropping-the-legacy-creator-columns).

Schema validation remains enabled throughout; no record deletion is needed.

These steps assume only users and creators are populated and workflow tables are
empty. Populated legacy workflow tables need a separate conversion plan.
Preserve a snapshot before migrating data you need to keep.

Progress is keyed by the full exported function path, so renaming a dated file
or its export starts fresh progress and rescans every record.

## Run migrations

Install dependencies, then deploy the compatible backend and wait for a successful
deployment before running the registered migrations:

```bash
bunx convex dev --once
bunx convex run --deployment dev migrations/runner:runAll
```

Alternatively, use `just bd` to deploy and watch the backend, and run the migration
command in a second terminal after deployment succeeds.

`runAll` removes legacy user profile-picture URLs (see the compatibility rollout
below), then moves legacy creator niches into association rows. It skips
completed migrations and resumes interrupted ones.

Available migrations:

- [2026_10_07_remove_user_profile_pictures.ts](../convex/migrations/2026_10_07_remove_user_profile_pictures.ts)
  exports `removeUserProfilePictures`. It drops the legacy `profilePicture` URL
  from each user, preserving `profilePictureMediaId` and every other field.
- [2026_10_25_backfill_creator_niches.ts](../convex/migrations/2026_10_25_backfill_creator_niches.ts)
  exports `backfillCreatorNiches`. It moves a creator's legacy `niches` array into
  `creatorNiches` association rows through `updateCreatorNiches`, which also
  removes the legacy field. Creators without the field are left alone, so it is
  safe to rerun.

These preserve document IDs and relationships. To select one migration, use `run`
with its full function path:

```bash
bunx convex run --deployment dev migrations/runner:run \
  '{"fn":"migrations/2026_10_07_remove_user_profile_pictures:removeUserProfilePictures"}'
```

Add `"reset": true` to deliberately rescan from the beginning, including records
added after an earlier completed run:

```bash
bunx convex run --deployment dev migrations/runner:run \
  '{"fn":"migrations/2026_10_25_backfill_creator_niches:backfillCreatorNiches","reset":true}'
```

Passing `{"reset":true}` to `runAll` resets the entire registered sequence.

Add `"dryRun": true` to preview one batch without saving changes. The intentional
`DRY RUN` result rolls the batch back. Preview each migration separately, since a
dry run does not execute the full sequence. For example, preview the first batch
of the niche backfill even if it has already completed:

```bash
bunx convex run --deployment dev migrations/runner:run \
  '{"fn":"migrations/2026_10_25_backfill_creator_niches:backfillCreatorNiches","dryRun":true,"reset":true}'
```

## Check completion and resume

The runner can return before scheduled batches finish. Check status:

```bash
bunx convex run --deployment dev --component migrations lib:getStatus \
  '{"names":["migrations/2026_10_07_remove_user_profile_pictures:removeUserProfilePictures","migrations/2026_10_25_backfill_creator_niches:backfillCreatorNiches"]}'
```

Wait until each entry reports `isDone: true` and `state: "success"`. If a batch
fails, fix the reported cause and rerun the same command without `reset` to resume
from saved progress.

Verify that IDs, record counts, and creator-to-user links are preserved. Users
should have no legacy `profilePicture`, and scanned creator profiles should have
no legacy `niches` array.

Repeat deployment, migration, and verification for each teammate's personal
development database.

## Troubleshooting deployment

- A missing `migrations` export from `runner.ts` is a code-version mismatch,
  separate from schema validation. Use a consistent checkout: `runner.ts` must
  export the shared `migrations` instance, and dated filenames and imports must
  match the checked-in version. Changing the users schema does not fix this
  import error.
- A validation error for legacy `users.name`, or for a missing
  `firstName`/`lastName`, means the deployment still holds unmigrated user rows.
  The schema is strict now, so there is no compatible backend to deploy first. See
  [Recovering an unmigrated deployment](#recovering-an-unmigrated-deployment).

## Remove legacy user profile-picture URLs

The strict users schema no longer accepts `profilePicture`. If a deployment has
legacy URLs, first temporarily retain `profilePicture: v.optional(v.string())`
in `convex/schemas/users.schema.ts` while deploying this backend. The updated
WorkOS handlers no longer write URLs, so they cannot reintroduce them during cleanup.
Run only this migration on the selected development deployment:

```bash
bunx convex run --deployment dev migrations/runner:run \
  '{"fn":"migrations/2026_10_07_remove_user_profile_pictures:removeUserProfilePictures"}'
bunx convex run --deployment dev --component migrations lib:getStatus \
  '{"names":["migrations/2026_10_07_remove_user_profile_pictures:removeUserProfilePictures"]}'
```

Wait for `isDone: true` and `state: "success"`, verify user IDs and counts are
unchanged and URLs are gone, then restore and deploy the checked-in strict schema.
The cleanup preserves `profilePictureMediaId`, all other user fields, and company
logos. Repeat for each populated deployment. Production cleanup requires an
explicitly approved production rollout, not these development commands.

## Removed migrations

A migration is removed once every deployment has run it and the schema it
prepared for has landed. Removing one also removes the only supported way to fix
a deployment that never ran it, so each removal is recorded here.

- `2026_09_26_backfill_user_names.ts` exported `backfillUserNames`. It moved
  legacy `users.name` onto `firstName` and `lastName`, preferring name parts
  cached from WorkOS and keeping a whole legacy name as `firstName` when no parts
  were available, since a legacy name cannot be split reliably. It used the
  account email for a missing or blank first name and `""` for a missing last
  name. Removed with `users.name` itself, in the change that made `firstName` and
  `lastName` required.
- `2026_09_26_backfill_creator_usernames.ts` exported `backfillCreatorUsernames`.
  It filled a creator's missing username and replaced a generated
  `creator_<userId>` value with `creator_` plus a random suffix. Removed with
  `creators.username` and its `by_username` index, which the creator profile
  rework deleted.

### Recovering an unmigrated deployment

For a development deployment, wiping and reseeding is quicker than migrating. To
keep the data, restore the deleted file from git history, register it first in
the `runAll` list, widen `convex/schemas/users.schema.ts` to accept the legacy
shape, deploy, run it, then restore the checked-in schema:

```bash
git log --diff-filter=D --oneline -- convex/migrations/2026_09_26_backfill_user_names.ts
git show <commit>^:convex/migrations/2026_09_26_backfill_user_names.ts \
  > convex/migrations/2026_09_26_backfill_user_names.ts
```

The legacy shape is `name: v.optional(v.string())` plus `firstName` and
`lastName` as `v.optional(v.string())`. The profile response validators in
`convex/users.ts`, `convex/models/creators.ts`, and
`convex/models/companyUsers.ts` need the same widening to serve those rows.

### Dropping the legacy creator columns

The creator profile rework removes `username`, `xId`, and `phoneNumber` from
`creators` with no migration, so a deployment whose creator rows still carry any
of them will have its schema push rejected. There is no backfill to run.

Wiping and reseeding is the quickest fix for a development deployment. To keep
the data, add a dated migration that `ctx.db.replace`s each creator row without
the three fields, following [Add a migration](#add-a-migration), and temporarily
restore them as `v.optional` in `convex/schemas/creators.schema.ts` so the
compatible backend deploys first.

## Add a migration

1. Add a `YYYY_MM_DD_migration_title.ts` file in `convex/migrations/`. Use
   underscores because Convex module paths do not allow hyphens. Import the
   shared `migrations` instance from `./runner` and export a
   `migrations.define(...)` definition. Keep its transformation logic, helpers,
   and types in the same dated file. Reuse model helpers for shared domain rules.
2. Register its generated `internal` function reference in the `runAll` list in
   `runner.ts`, after any migrations it depends on. The list defines execution
   order; filenames alone do not register or order migrations.
3. Test the transformation and runner, document any schema compatibility steps,
   deploy the code, and run `runAll`. Deploying alone does not start it.

Keep registered filenames and export names stable once deployed, since renaming
them creates a new progress entry and causes a rescan.

To remove a migration, delete its file and test, unregister it from `runAll`, and
add it to [Removed migrations](#removed-migrations) with what it did.
