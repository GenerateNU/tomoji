import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Deadlines and closure runs share exact :00/:30 UTC boundaries.
crons.cron("close expired opportunities", "0,30 * * * *", internal.opportunities.closeExpired, {});

export default crons;
