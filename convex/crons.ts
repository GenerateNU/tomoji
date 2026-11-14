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

// Charges approved payouts, minutes after approval, since the company is not present.
crons.interval("charge approved payouts", { minutes: 1 }, internal.charging.chargeDue, {});

// Recovers stalled charges and payouts whose dispute has closed.
crons.interval("recover payout charges", { minutes: 15 }, internal.charging.sweep, {});

export default crons;
