/**
 * Copies WorkOS, S3, and an optional complete X configuration from .env.local onto the Convex
 * deployment.
 *
 * Convex reads these server-side, not from .env.local:
 *   WORKOS_CLIENT_ID
 *   WORKOS_API_KEY
 *   WORKOS_WEBHOOK_SECRET
 *   S3_MEDIA_BUCKET
 *   S3_MEDIA_REGION
 *   X_CLIENT_ID / X_CLIENT_SECRET / X_REDIRECT_URI (when supplied together)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const KEYS = ["WORKOS_CLIENT_ID", "WORKOS_API_KEY", "S3_MEDIA_BUCKET", "S3_MEDIA_REGION"] as const;

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

const missing = KEYS.filter((key) => readValue(key) === "");
if (missing.length > 0) {
  console.error(
    `Empty in ${ENV_FILE}: ${missing.join(", ")}. Ask a TL for the values, then re-run.`,
  );
  process.exit(1);
}

for (const key of [...KEYS, ...(configureX ? X_KEYS : [])]) {
  const result = spawnSync("bunx", ["convex", "env", "set", key, readValue(key)], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

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

const result = spawnSync("bunx", ["convex", "env", "set", "WORKOS_WEBHOOK_SECRET", webhookSecret], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
