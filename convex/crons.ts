import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("close expired campaigns", { minutes: 1 }, internal.campaigns.closeExpired, {});

// Deadlines and closure runs share exact :00/:30 UTC boundaries.
crons.cron("close expired opportunities", "0,30 * * * *", internal.opportunities.closeExpired, {});

// Runs at :00 and :30 UTC, like the opportunity deadline cron. Accept already
// refuses expired offers; this makes the expiry visible in status.
crons.cron("expire application offers", "0,30 * * * *", internal.applications.expireOffers, {});

export default crons;
