/**
 * Copies the WorkOS values Convex needs from .env.local onto the Convex
 * deployment.
 *
 * Convex reads these server-side, not from .env.local:
 *   WORKOS_CLIENT_ID
 *   WORKOS_API_KEY
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const KEYS = ["WORKOS_CLIENT_ID", "WORKOS_API_KEY"] as const;

if (!existsSync(ENV_FILE)) {
  console.error(`${ENV_FILE} not found. Run \`just setup\` first.`);
  process.exit(1);
}

const contents = readFileSync(ENV_FILE, "utf8");

function readValue(key: string): string {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
  return (match?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
}

const missing = KEYS.filter((key) => readValue(key) === "");
if (missing.length > 0) {
  console.error(
    `Empty in ${ENV_FILE}: ${missing.join(", ")}. Ask a TL for the values, then re-run.`,
  );
  process.exit(1);
}

for (const key of KEYS) {
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
