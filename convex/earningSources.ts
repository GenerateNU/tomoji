import { internalMutation } from "./_generated/server";
import {
  postRemovalEvidence,
  postViewObservation,
  recordPostRemoval,
  recordPostViewSnapshot,
} from "./models/earningSources";
import schema from "./schema";

/** Trusted metric ingestion: caller supplies the actual observation time, not delivery time. */
export const recordViews = internalMutation({
  args: postViewObservation.fields,
  returns: schema.doc("postViewSnapshots"),
  handler: async (ctx, args) => await recordPostViewSnapshot(ctx, args),
});

/** A confirmed removal ends future accrual; temporary request failures are not evidence. */
export const recordRemoval = internalMutation({
  args: postRemovalEvidence.fields,
  returns: schema.doc("posts"),
  handler: async (ctx, args) => await recordPostRemoval(ctx, args),
});
