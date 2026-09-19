/**
 * Prints the deployed function surface: what it is, and who can call it.
 *
 * Worth a glance before opening a PR — an endpoint that should be internal
 * and isn't is callable by any signed-in user.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("bunx", ["convex", "function-spec"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

type Fn = {
  identifier?: string;
  functionType: string;
  visibility: { kind: string };
};

const parsed: unknown = JSON.parse(result.stdout);
const functions: Fn[] = Array.isArray(parsed)
  ? (parsed as Fn[])
  : ((parsed as { functions?: Fn[] }).functions ?? []);

const rows = functions.filter((f) => f.identifier !== undefined);
const width = Math.max(...rows.map((f) => f.identifier!.length));

for (const kind of ["public", "internal"]) {
  const group = rows.filter((f) => f.visibility.kind === kind);
  if (group.length === 0) continue;
  console.log(`\n${kind.toUpperCase()}`);
  for (const f of group) {
    console.log(`  ${f.identifier!.padEnd(width)}  ${f.functionType}`);
  }
}
console.log();
