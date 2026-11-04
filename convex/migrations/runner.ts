import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

export const migrations = new Migrations(components.migrations, { internalMutation });

export const run = migrations.runner();

// Append new migrations in execution order; deploying alone does not run them.
export const runAll = migrations.runner([
  internal.migrations["2026_10_07_remove_user_profile_pictures"].removeUserProfilePictures,
  internal.migrations["2026_10_25_backfill_creator_niches"].backfillCreatorNiches,
  internal.migrations["2026_10_25_backfill_opportunity_niches"].backfillOpportunityNiches,
]);
