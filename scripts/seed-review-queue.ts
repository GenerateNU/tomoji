/**
 * Builds the `seed:seedReviewQueue` argument, uploading any videos given on the
 * way so the seeded drafts have playable content. Prints JSON on stdout for the
 * `just seed-review` recipe to hand to Convex.
 *
 * Usage: bun scripts/seed-review-queue.ts <admin-email> [video.mp4 ...]
 */
import { spawnSync } from "node:child_process";

const [companyAdminEmail, ...videoFiles] = process.argv.slice(2);
if (!companyAdminEmail) {
  console.error("Usage: bun scripts/seed-review-queue.ts <admin-email> [video.mp4 ...]");
  process.exit(1);
}

let videos: unknown[] = [];
if (videoFiles.length > 0) {
  const upload = spawnSync("bun", ["scripts/upload-seed-videos.ts", ...videoFiles], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (upload.status !== 0) process.exit(upload.status ?? 1);
  videos = JSON.parse(upload.stdout.trim());
}

console.log(JSON.stringify({ companyAdminEmail, videos }));
