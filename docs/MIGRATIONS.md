# Database migrations

Migrations are registered in [convex/migrations.ts](../convex/migrations.ts), with
transformations in [convex/models/migrations.ts](../convex/models/migrations.ts).
The runner processes records in batches and tracks progress; deploying the code
alone does not run a migration.

## Before running

Use your personal development deployment configured in `.env.local`
(`CONVEX_DEPLOYMENT=dev:...`), without a deployment-key override. The current schema
requires `firstName` and `lastName` and does not accept legacy `users.name`.
The user model rejects blank first names; an empty last name is allowed.
Creator `username` remains optional.

Existing incompatible records must be converted under a compatible deployment
before the strict schema can deploy. The retained backfills do not bypass schema
validation. For empty or already compatible databases, install dependencies and
deploy normally with `just bd` or `bunx convex dev --once`.

These backfills cover users and creators. Any populated legacy workflow tables
need a separate conversion plan. Preserve a snapshot before migrating data you
need to keep.

## Run a migration

After its code is deployed, run an exported migration by name:

```bash
bunx convex run --deployment dev migrations:run \
  '{"fn":"migrations:<migrationName>"}'
```

Available migrations:

- `backfillUserNames` preserves existing name parts, fills missing parts from
  cached WorkOS data, and retains a whole legacy name as `firstName` only when no
  split name parts are available. It removes legacy `name` and uses `""` for a
  missing last name. It fails if the resulting first name is blank; it does not
  invent a replacement for a present but invalid first name.
- `backfillCreatorUsernames` fills missing usernames with `creator_<userId>` and
  preserves existing values, including empty strings. It does not change signup
  behavior or make username required.

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
