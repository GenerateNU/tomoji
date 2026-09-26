import { internal } from "../_generated/api";
import { migrations } from "../lib/migrations";

export const run = migrations.runner();

// Append new migrations in execution order; deploying alone does not run them.
export const runAll = migrations.runner([
  internal.migrations["2026_09_26_backfill_user_names"].backfillUserNames,
  internal.migrations["2026_09_26_backfill_creator_usernames"].backfillCreatorUsernames,
]);
