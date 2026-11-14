import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Campaign end dates and closure runs share exact :00/:30 UTC boundaries.
crons.cron("close expired campaigns", "0,30 * * * *", internal.campaigns.closeExpired, {});

// Deadlines and closure runs share exact :00/:30 UTC boundaries.
crons.cron("close expired opportunities", "0,30 * * * *", internal.opportunities.closeExpired, {});

// Runs at :00 and :30 UTC, like the opportunity deadline cron. Accept already
// refuses expired offers; this makes the expiry visible in status.
crons.cron("expire application offers", "0,30 * * * *", internal.applications.expireOffers, {});

// Payout review deadlines are exact elapsed times, not half-hour boundaries.
crons.interval("approve due payouts", { minutes: 1 }, internal.payouts.autoApprove, {});

// Each deliverable keeps its own verification-based earning boundaries.
crons.interval("create due earnings", { minutes: 1 }, internal.earningsSchedules.sweep, {});

// Analytics only: payouts settle from their own readings. Does nothing unless
// X_METRICS_SYNC_ENABLED is "true", so personal deployments don't spend X credits.
crons.cron("sync X post metrics", "0 0 * * *", internal.xMetrics.sync, {});

export default crons;
