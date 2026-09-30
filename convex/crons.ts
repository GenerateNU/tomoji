import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Deadlines and closure runs share exact :00/:30 UTC boundaries.
crons.cron("close expired opportunities", "0,30 * * * *", internal.opportunities.closeExpired, {});

// Accept already refuses expired offers; this makes the expiry visible in status.
crons.interval("expire application offers", { minutes: 5 }, internal.applications.expireOffers, {});

export default crons;
