import { migrateCreatorUsername } from "../models/migrations";
import { migrations } from "./runner";

export const backfillCreatorUsernames = migrations.define({
  table: "creators",
  migrateOne: migrateCreatorUsername,
});
