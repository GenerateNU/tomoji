import { operatorQuery } from "./lib/functions";
import { getOperatorOverview, operatorOverview } from "./models/operators";

/**
 * Platform-wide counts for the operator home page. Each count stops at
 * `COUNT_CAP` rows and reports `capped: true` rather than scanning a whole
 * table, so the page stays cheap as the product grows.
 */
export const overview = operatorQuery({
  args: {},
  returns: operatorOverview,
  handler: async (ctx) => {
    return await getOperatorOverview(ctx);
  },
});
