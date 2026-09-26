import { migrations } from "../lib/migrations";
import { migrateCreatorUsername } from "../models/migrations";

export const backfillCreatorUsernames = migrations.define({
  table: "creators",
  migrateOne: migrateCreatorUsername,
});
