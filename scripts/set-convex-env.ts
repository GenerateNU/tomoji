/**
 * Copies WORKOS_CLIENT_ID from .env.local onto the Convex deployment, which is
 * where convex/auth.config.ts reads it from.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const KEY = "WORKOS_CLIENT_ID";

if (!existsSync(ENV_FILE)) {
  console.error(`${ENV_FILE} not found. Run \`just setup\` first.`);
  process.exit(1);
}

const match = readFileSync(ENV_FILE, "utf8").match(new RegExp(`^${KEY}=(.*)$`, "m"));
const value = (match?.[1] ?? "").trim().replace(/^["']|["']$/g, "");

if (!value) {
  console.error(`${KEY} is empty in ${ENV_FILE}. Ask a TL for the value, then re-run.`);
  process.exit(1);
}

const result = spawnSync("bunx", ["convex", "env", "set", KEY, value], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
