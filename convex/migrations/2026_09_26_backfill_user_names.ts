import { migrateUserNames } from "../models/migrations";
import { migrations } from "./runner";

export const backfillUserNames = migrations.define({
  table: "users",
  migrateOne: migrateUserNames,
});
