import { migrations } from "../lib/migrations";
import { migrateUserNames } from "../models/migrations";

export const backfillUserNames = migrations.define({
  table: "users",
  migrateOne: migrateUserNames,
});
