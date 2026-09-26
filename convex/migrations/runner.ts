import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

export const migrations = new Migrations(components.migrations, { internalMutation });

export const run = migrations.runner();

// Append new migrations in execution order; deploying alone does not run them.
export const runAll = migrations.runner([
  internal.migrations["2026_09_26_backfill_user_names"].backfillUserNames,
  internal.migrations["2026_09_26_backfill_creator_usernames"].backfillCreatorUsernames,
]);
