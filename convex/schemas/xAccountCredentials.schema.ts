import { defineTable } from "convex/server";
import { v } from "convex/values";

export const encryptedXTokens = v.object({
  ciphertext: v.bytes(),
  iv: v.bytes(),
  keyVersion: v.string(),
});

// AES-256-GCM ciphertext only. Keys live in deployment secrets, not this table.
// Never expose decrypted credentials through public functions, profiles, or logs.
export const xAccountCredentialsTable = defineTable({
  xAccountId: v.id("xAccounts"),
  encryptedTokens: encryptedXTokens,
  accessTokenExpiresAt: v.number(),
  scopes: v.array(v.string()),
  credentialVersion: v.number(),
}).index("by_xAccountId", ["xAccountId"]);
