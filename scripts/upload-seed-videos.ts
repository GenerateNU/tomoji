/**
 * Uploads local MP4s straight to the submission-video prefix on the development
 * bucket, so seeded submissions have something the review modal can actually
 * play. The real upload path grants a browser a staging key and promotes it
 * after inspection; this skips that because there is no browser and no creator
 * session to grant it to.
 *
 * Development only. It refuses to run unless the deployment has opted into
 * seeding, and it writes nothing outside `media/video-submission/`.
 *
 * Usage: bun scripts/upload-seed-videos.ts <file.mp4> [more.mp4 ...]
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const PREFIX = "media/video-submission/";
const MAX_BYTES = 250 * 1024 * 1024;

function convexEnv(name: string): string {
  const result = spawnSync("bunx", ["convex", "env", "get", "--", name], { encoding: "utf8" });
  const value = result.stdout?.trim();
  if (result.status !== 0 || !value) {
    throw new Error(`Could not read ${name} from the Convex deployment.`);
  }
  return value;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: bun scripts/upload-seed-videos.ts <file.mp4> [more.mp4 ...]");
  process.exit(1);
}

if (convexEnv("TOMOJI_DEV_SEED") !== "true") {
  console.error("TOMOJI_DEV_SEED is not true on this deployment. Refusing to upload seed media.");
  process.exit(1);
}

const bucket = convexEnv("S3_MEDIA_BUCKET");
const region = convexEnv("S3_MEDIA_REGION");
const client = new S3Client({ region });

const uploaded: { key: string; sizeBytes: number }[] = [];
for (const file of files) {
  const body = await readFile(file);
  if (body.byteLength < 1 || body.byteLength > MAX_BYTES) {
    throw new Error(`${basename(file)} is ${body.byteLength} bytes, outside the allowed range.`);
  }
  // The server only accepts a permanent key of this exact shape.
  const key = `${PREFIX}${crypto.randomUUID()}`;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "video/mp4" }),
  );
  uploaded.push({ key, sizeBytes: body.byteLength });
  console.error(`uploaded ${basename(file)} -> ${key}`);
}

// stdout is the seed mutation's `videos` argument, so the two can be piped.
console.log(JSON.stringify(uploaded));
