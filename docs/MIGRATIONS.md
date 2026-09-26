# Database migrations

Migrations are registered in [convex/migrations.ts](../convex/migrations.ts), with
transformations in [convex/models/migrations.ts](../convex/models/migrations.ts).
The runner processes records in batches and tracks progress; deploying the code
alone does not run a migration.

## Before running

Use your personal development deployment configured in `.env.local`
(`CONVEX_DEPLOYMENT=dev:...`), without a deployment-key override. The current schema
requires `firstName` and `lastName` and does not accept legacy `users.name`.
User sync and the name backfill use the account email for a missing or blank
first name and `""` for a missing last name. Creator `username` remains optional.

Existing incompatible records must be converted under a compatible deployment
before the strict schema can deploy. The retained backfills do not bypass schema
validation. For empty or already compatible databases, install dependencies and
deploy normally with `just bd` or `bunx convex dev --once`.

These backfills cover users and creators. Any populated legacy workflow tables
need a separate conversion plan. Preserve a snapshot before migrating data you
need to keep.

Username lookups use the normalized value in the `by_username` index. Before
enabling these checks on a populated deployment, ensure existing nonblank
usernames are trimmed and lowercase and resolve duplicate values. The backfill
only fills missing usernames; it does not normalize or rename existing choices.

## Run a migration

After its code is deployed, run an exported migration by name:

```bash
bunx convex run --deployment dev migrations:run \
  '{"fn":"migrations:<migrationName>"}'
```

Available migrations:

- `backfillUserNames` preserves existing name parts, fills missing parts from
  cached WorkOS data, and retains a whole legacy name as `firstName` only when no
  split name parts are available. If the selected first name is missing, empty,
  or whitespace-only, it uses the account email. It removes legacy `name` and
  uses `""` for a missing last name.
- `backfillCreatorUsernames` fills missing usernames with `creator_<userId>` and
  preserves existing values, including empty strings. New values are trimmed and
  lowercased and checked through `by_username` in the same mutation as the write,
  using the same model validation as profile updates. If another creator owns
  that value, the migration fails with `conflict`. The index is not itself a
  unique constraint. This does not change signup behavior or make username required.

Both preserve document IDs and relationships. To run them in order:

```bash
bunx convex run --deployment dev migrations:run \
  '{"fn":"migrations:backfillUserNames","next":["migrations:backfillCreatorUsernames"]}'
```

Add `"reset": true` to deliberately rescan from the beginning, including records
added after an earlier completed run. Add `"dryRun": true` to preview one batch
without saving changes; preview each migration separately, since a dry run does
not execute the full sequence.

## Check completion and resume

The runner can return before scheduled batches finish. Check status:

```bash
bunx convex run --deployment dev --component migrations lib:getStatus \
  '{"names":["migrations:backfillUserNames","migrations:backfillCreatorUsernames"]}'
```

Wait until both entries report `isDone: true` and `state: "success"`. If a batch
fails, fix the reported cause and rerun the same command without `reset` to resume
from saved progress.

Verify that IDs, record counts, and creator-to-user links are preserved. Migrated
users should have a nonblank `firstName`, a string `lastName` (possibly `""`), and
no legacy `name`. The username backfill fills absent values on scanned profiles;
new profiles can still be created without a username afterward.
