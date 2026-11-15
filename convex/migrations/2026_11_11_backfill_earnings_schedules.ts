import { ensureEarningsSchedule } from "../models/earningsSchedules";
import { migrations } from "./runner";

/** Adds scheduling metadata for stored agreements without settling or inventing earnings. */
export const backfillEarningsSchedules = migrations.define({
  table: "deliverableEarnings",
  batchSize: 25,
  migrateOne: async (ctx, earnings) => {
    await ensureEarningsSchedule(ctx, earnings._id);
  },
});
