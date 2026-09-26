import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { migrateCreatorUsername, migrateUserNames } from "./models/migrations";

const migrations = new Migrations(components.migrations, { internalMutation });

export const backfillUserNames = migrations.define({
  table: "users",
  migrateOne: migrateUserNames,
});

// Restart through the runner with reset: true to include profiles created after an earlier run.
export const backfillCreatorUsernames = migrations.define({
  table: "creators",
  migrateOne: migrateCreatorUsername,
});

// Internal runner; migration names and resumable progress are managed by the component.
export const run = migrations.runner();
