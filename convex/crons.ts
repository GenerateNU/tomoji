import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("close expired campaigns", { minutes: 1 }, internal.campaigns.closeExpired, {});

export default crons;
