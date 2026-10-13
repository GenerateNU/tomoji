import { describe, expect, test } from "vitest";
import { decryptXTokens, encryptXTokens } from "../../lib/xTokenEncryption";
import { expectApiError, X_TOKEN_TEST_CONFIG } from "../helpers";
import type { Id } from "../../_generated/dataModel";

const creatorId = "creator_encryption_fixture" as Id<"creators">;
const tokens = { accessToken: "test-access-token", refreshToken: "test-refresh-token" };

describe("X token encryption", () => {
  test("round trips both tokens with fresh IVs and no plaintext in the envelope", async () => {
    const first = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    const second = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    expect(first.iv.byteLength).toBe(12);
    expect(first.keyVersion).toBe("v1");
    expect(new Uint8Array(first.iv)).not.toEqual(new Uint8Array(second.iv));
    expect(new Uint8Array(first.ciphertext)).not.toEqual(new Uint8Array(second.ciphertext));
    expect(new TextDecoder().decode(first.ciphertext)).not.toContain(tokens.accessToken);
    expect(new TextDecoder().decode(first.ciphertext)).not.toContain(tokens.refreshToken);
    expect(await decryptXTokens(creatorId, first, X_TOKEN_TEST_CONFIG)).toEqual(tokens);
  });

  test("rejects tampered ciphertext without disclosing provider tokens", async () => {
    const encrypted = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    new Uint8Array(encrypted.ciphertext)[0] ^= 1;
    await expectApiError(
      () => decryptXTokens(creatorId, encrypted, X_TOKEN_TEST_CONFIG),
      "invalid_state",
    );
  });

  test("rejects moving a credential envelope to a different creator", async () => {
    const encrypted = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    await expectApiError(
      () => decryptXTokens("other_creator" as Id<"creators">, encrypted, X_TOKEN_TEST_CONFIG),
      "invalid_state",
    );
  });

  test("rejects a tampered IV", async () => {
    const encrypted = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    new Uint8Array(encrypted.iv)[0] ^= 1;
    await expectApiError(
      () => decryptXTokens(creatorId, encrypted, X_TOKEN_TEST_CONFIG),
      "invalid_state",
    );
  });

  test("rejects an unavailable historical key rather than falling back to the active key", async () => {
    const encrypted = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    await expectApiError(
      () => decryptXTokens(creatorId, { ...encrypted, keyVersion: "unknown" }, X_TOKEN_TEST_CONFIG),
      "misconfigured",
    );
  });

  test("decrypts retained keys after selecting a new active key", async () => {
    const old = await encryptXTokens(creatorId, tokens, X_TOKEN_TEST_CONFIG);
    const rotated = {
      X_TOKEN_ENCRYPTION_KEY_VERSION: "v2",
      X_TOKEN_ENCRYPTION_KEYS: JSON.stringify({
        ...JSON.parse(X_TOKEN_TEST_CONFIG.X_TOKEN_ENCRYPTION_KEYS),
        v2: btoa("b".repeat(32)),
      }),
    };
    const current = await encryptXTokens(creatorId, tokens, rotated);
    expect(current.keyVersion).toBe("v2");
    expect(await decryptXTokens(creatorId, old, rotated)).toEqual(tokens);
    expect(await decryptXTokens(creatorId, current, rotated)).toEqual(tokens);
  });

  test("fails closed when encryption configuration is missing", async () => {
    await expectApiError(() => encryptXTokens(creatorId, tokens, {}), "misconfigured");
  });

  test("rejects a key that is not exactly 256 bits", async () => {
    await expectApiError(
      () =>
        encryptXTokens(creatorId, tokens, {
          X_TOKEN_ENCRYPTION_KEY_VERSION: "v1",
          X_TOKEN_ENCRYPTION_KEYS: JSON.stringify({ v1: btoa("short") }),
        }),
      "misconfigured",
    );
  });
});
