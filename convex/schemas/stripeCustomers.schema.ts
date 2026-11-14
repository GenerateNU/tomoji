import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A saved card as Stripe describes it. Only what identifies the card to the
 * company ("Visa •••• 4242, expires 08/28") is kept; Stripe holds the number.
 */
export const savedCard = v.object({
  paymentMethodId: v.string(),
  // Stripe's network code, such as `visa` or `mastercard`: the card's
  // `display_brand`, which names the network printed on a co-branded card.
  brand: v.string(),
  last4: v.string(),
  expMonth: v.number(),
  expYear: v.number(),
});

/**
 * Each company's payer record in Stripe (a "customer"), kept on Tomoji's own
 * Stripe account, with the card the company saved. Approved payouts are charged
 * to this card: for each payout we copy it onto the creator's Stripe account and
 * charge it there, since money for a Standard account has to be charged on that
 * account. Only the Stripe webhook changes the saved card.
 */
export const stripeCustomersTable = defineTable({
  companyId: v.id("companies"),
  stripeCustomerId: v.string(),
  // Absent from when a company admin first opens Checkout until they finish it.
  card: v.optional(savedCard),
  // When Stripe produced the stored card, in Unix ms. Stripe does not deliver
  // webhooks in order, so older card events are skipped against this.
  stripeUpdatedAt: v.number(),
})
  .index("by_companyId", ["companyId"])
  .index("by_stripeCustomerId", ["stripeCustomerId"]);
