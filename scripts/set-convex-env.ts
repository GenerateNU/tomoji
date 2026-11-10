/**
 * Copies WorkOS, S3, and optional X OAuth/encryption and Stripe settings from .env.local onto the
 * Convex deployment.
 *
 * Convex reads these server-side, not from .env.local:
 *   WORKOS_CLIENT_ID
 *   WORKOS_API_KEY
 *   WORKOS_WEBHOOK_SECRET
 *   WORKOS_OPERATOR_ORG_ID
 *   S3_MEDIA_BUCKET
 *   S3_MEDIA_REGION
 *   X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI (when supplied together)
 *   X_BEARER_TOKEN / X_METRICS_SYNC_ENABLED (each when supplied)
 *   STRIPE_SECRET_KEY / SITE_URL / STRIPE_WEBHOOK_SECRET (when a test-mode key is supplied)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_OPERATOR_ORG_ID",
  "S3_MEDIA_BUCKET",
  "S3_MEDIA_REGION",
] as const;

if (!existsSync(ENV_FILE)) {
  console.error(`${ENV_FILE} not found. Run \`just setup\` first.`);
  process.exit(1);
}

const contents = readFileSync(ENV_FILE, "utf8");

/** Reads a setup value without printing its contents. */
function readValue(key: string): string {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
  return (match?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
}

const X_KEYS = ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI"] as const;
const configureX = readValue("X_CLIENT_ID") !== "" || readValue("X_CLIENT_SECRET") !== "";
if (configureX && X_KEYS.some((key) => readValue(key) === "")) {
  console.error(
    "Set X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI together, or leave both X credentials empty.",
  );
  process.exit(1);
}

const AI_KEYS = ["ASSEMBLYAI_API_KEY", "TYPESAFE_API_KEY"] as const;
const configureAi =
  AI_KEYS.some((key) => readValue(key) !== "") || readValue("AI_REVIEW_ENABLED") === "true";
if (configureAi && AI_KEYS.some((key) => readValue(key) === "")) {
  console.error(
    "Set ASSEMBLYAI_API_KEY and TYPESAFE_API_KEY together, or leave AI review disabled and both keys empty.",
  );
  process.exit(1);
}
const aiEnabled = readValue("AI_REVIEW_ENABLED");
if (aiEnabled !== "" && aiEnabled !== "true" && aiEnabled !== "false") {
  console.error("AI_REVIEW_ENABLED must be true or false.");
  process.exit(1);
}

const ENCRYPTION_KEYS = ["X_TOKEN_ENCRYPTION_KEYS", "X_TOKEN_ENCRYPTION_KEY_VERSION"] as const;
const configureEncryption = ENCRYPTION_KEYS.some((key) => readValue(key) !== "");
// Either can be set alone; only an enabled sync with no token can't run.
if (readValue("X_METRICS_SYNC_ENABLED") === "true" && readValue("X_BEARER_TOKEN") === "") {
  console.error(
    "X_METRICS_SYNC_ENABLED=true needs X_BEARER_TOKEN. Set the token or turn the flag off.",
  );
  process.exit(1);
}
const METRICS_KEYS = ["X_BEARER_TOKEN", "X_METRICS_SYNC_ENABLED"] as const;

// SITE_URL ships with a default in the template, so only the key opts in.
const STRIPE_KEYS = ["STRIPE_SECRET_KEY", "SITE_URL"] as const;
const stripeSecretKey = readValue("STRIPE_SECRET_KEY");
const configureStripe = stripeSecretKey !== "";
// This script only targets personal dev deployments, which must never move real money.
if (/^(sk|rk)_live_/.test(stripeSecretKey)) {
  console.error(
    "STRIPE_SECRET_KEY is a live key. Use a test-mode key (sk_test_ or rk_test_) from a Stripe sandbox.",
  );
  process.exit(1);
}

const keys = [
  ...KEYS,
  ...(configureAi ? AI_KEYS : []),
  ...(aiEnabled !== "" ? ["AI_REVIEW_ENABLED"] : []),
  ...(configureX ? X_KEYS : []),
  ...(configureEncryption ? ENCRYPTION_KEYS : []),
  ...METRICS_KEYS.filter((key) => readValue(key) !== ""),
  ...(configureStripe ? STRIPE_KEYS : []),
];
const missing = keys.filter((key) => readValue(key) === "");
if (missing.length > 0) {
  console.error(
    `Empty in ${ENV_FILE}: ${missing.join(", ")}. Ask a TL for the values, then re-run.`,
  );
  process.exit(1);
}

for (const key of keys) {
  const result = spawnSync("bunx", ["convex", "env", "set", "--", key, readValue(key)], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Reads deployment metadata for setup guidance without exposing secret values. */
function convexEnv(key: string): string {
  const result = spawnSync("bunx", ["convex", "env", "get", key], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

const webhookSecret = readValue("WORKOS_WEBHOOK_SECRET");

if (webhookSecret === "") {
  console.error(
    [
      "",
      "WORKOS_WEBHOOK_SECRET is empty in .env.local. Convex won't start without it.",
      "",
      "Send a TL this webhook URL:",
      "",
      `  ${convexEnv("CONVEX_SITE_URL")}/workos/webhook`,
      "",
      "Paste the secret they send back into .env.local, then re-run this.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const result = spawnSync(
  "bunx",
  ["convex", "env", "set", "--", "WORKOS_WEBHOOK_SECRET", webhookSecret],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (configureStripe) {
  const stripeWebhookSecret = readValue("STRIPE_WEBHOOK_SECRET");
  if (stripeWebhookSecret === "") {
    console.error(
      [
        "",
        "STRIPE_WEBHOOK_SECRET is empty in .env.local. Creator onboarding status won't update without it.",
        "",
        "In the Stripe sandbox, add a webhook destination for connected accounts that sends",
        "account.updated to:",
        "",
        `  ${convexEnv("CONVEX_SITE_URL")}/stripe/webhook`,
        "",
        "Paste its signing secret (whsec_...) into .env.local, then re-run this.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
  const stripeResult = spawnSync(
    "bunx",
    ["convex", "env", "set", "STRIPE_WEBHOOK_SECRET", stripeWebhookSecret],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (stripeResult.status !== 0) process.exit(stripeResult.status ?? 1);
}
