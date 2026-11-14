import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

export const migrations = new Migrations(components.migrations, { internalMutation });

export const run = migrations.runner();

// Append new migrations in execution order; deploying alone does not run them.
export const runAll = migrations.runner([
  internal.migrations["2026_10_07_remove_user_profile_pictures"].removeUserProfilePictures,
  internal.migrations["2026_11_14_score_open_opportunities"].scoreOpenOpportunities,
  internal.migrations["2026_11_11_backfill_earnings_schedules"].backfillEarningsSchedules,
]);
