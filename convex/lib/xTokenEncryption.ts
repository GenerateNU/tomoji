import type { Id } from "../_generated/dataModel";
import { env } from "../_generated/server";
import { apiError } from "./errors";
import { requireNonBlank } from "./validation";
import type { Infer } from "convex/values";
import { encryptedXTokens } from "../schemas/xAccountCredentials.schema";

type EncryptionConfig = {
  X_TOKEN_ENCRYPTION_KEYS?: string;
  X_TOKEN_ENCRYPTION_KEY_VERSION?: string;
};
export type XTokens = { accessToken: string; refreshToken: string };
export type EncryptedXTokens = Infer<typeof encryptedXTokens>;
const IV_BYTES = 12;
const TAG_BITS = 128;

/** Resolves a versioned 256-bit key from deployment secrets, never database rows. */
async function importKey(config: EncryptionConfig, version: string): Promise<CryptoKey> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const keys: unknown = JSON.parse(config.X_TOKEN_ENCRYPTION_KEYS ?? "");
    if (keys === null || typeof keys !== "object" || Array.isArray(keys)) throw new Error();
    const encoded = (keys as Record<string, unknown>)[version];
    if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new Error();
    }
    bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    if (bytes.byteLength !== 32 || btoa(String.fromCharCode(...bytes)) !== encoded) {
      throw new Error();
    }
  } catch {
    throw apiError("misconfigured", { reason: "x_token_encryption_key_invalid" });
  }
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Binds ciphertext to its creator and key version so envelopes cannot be swapped. */
function additionalData(creatorId: Id<"creators">, keyVersion: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(["tomoji:x-tokens:v1", creatorId, keyVersion]));
}

/** Checks the opaque envelope before it reaches storage or the decryption boundary. */
export function validateEncryptedXTokens(tokens: EncryptedXTokens): void {
  if (
    !tokens ||
    !(tokens.iv instanceof ArrayBuffer) ||
    tokens.iv.byteLength !== IV_BYTES ||
    !(tokens.ciphertext instanceof ArrayBuffer) ||
    tokens.ciphertext.byteLength <= TAG_BITS / 8 ||
    tokens.ciphertext.byteLength > 64 * 1024 ||
    typeof tokens.keyVersion !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(tokens.keyVersion)
  ) {
    throw apiError("invalid_state", { reason: "x_encrypted_credentials_invalid" });
  }
}

/** Encrypts both tokens in an action before calling the persistence mutation. */
export async function encryptXTokens(
  creatorId: Id<"creators">,
  tokens: XTokens,
  config: EncryptionConfig = env,
): Promise<EncryptedXTokens> {
  requireNonBlank(tokens.accessToken, "accessToken");
  requireNonBlank(tokens.refreshToken, "refreshToken");
  const keyVersion = config.X_TOKEN_ENCRYPTION_KEY_VERSION;
  if (!keyVersion || !/^[A-Za-z0-9_-]{1,64}$/.test(keyVersion)) {
    throw apiError("misconfigured", { reason: "x_token_encryption_version_missing" });
  }
  const key = await importKey(config, keyVersion);
  // Cryptographic randomness is unavailable in Convex mutations. Keep this in actions.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: additionalData(creatorId, keyVersion),
      tagLength: TAG_BITS,
    },
    key,
    new TextEncoder().encode(
      JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),
    ),
  );
  const encrypted = { ciphertext, iv: iv.buffer, keyVersion };
  validateEncryptedXTokens(encrypted);
  return encrypted;
}

/** Decrypts only for server-side provider calls; never return this result publicly. */
export async function decryptXTokens(
  creatorId: Id<"creators">,
  encrypted: EncryptedXTokens,
  config: EncryptionConfig = env,
): Promise<XTokens> {
  validateEncryptedXTokens(encrypted);
  const key = await importKey(config, encrypted.keyVersion);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: encrypted.iv,
        additionalData: additionalData(creatorId, encrypted.keyVersion),
        tagLength: TAG_BITS,
      },
      key,
      encrypted.ciphertext,
    );
    const tokens: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    if (tokens === null || typeof tokens !== "object") throw new Error();
    const { accessToken, refreshToken } = tokens as Record<string, unknown>;
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") throw new Error();
    requireNonBlank(accessToken, "accessToken");
    requireNonBlank(refreshToken, "refreshToken");
    return { accessToken, refreshToken };
  } catch {
    throw apiError("invalid_state", { reason: "x_credentials_decryption_failed" });
  }
}
