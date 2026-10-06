import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));

const values = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "api_test",
  WORKOS_WEBHOOK_SECRET: "webhook_test",
  S3_MEDIA_BUCKET: "example-dev-media",
  S3_MEDIA_REGION: "us-east-1",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  vi.mocked(spawnSync).mockReturnValue({
    status: 0,
    stdout: "",
    stderr: "",
    pid: 0,
    output: [],
    signal: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
});

afterEach(() => vi.restoreAllMocks());

test("copies WorkOS and S3 configuration from the local env file", async () => {
  await import("../set-convex-env");
  for (const [key, value] of Object.entries(values)) {
    expect(spawnSync).toHaveBeenCalledWith(
      "bunx",
      ["convex", "env", "set", key, value],
      expect.any(Object),
    );
  }
  expect(spawnSync).toHaveBeenCalledTimes(5);
});

test("rejects a missing S3 bucket before making deployment changes", async () => {
  vi.mocked(readFileSync).mockReturnValue(
    Object.entries(values)
      .filter(([key]) => key !== "S3_MEDIA_BUCKET")
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("S3_MEDIA_BUCKET"));
  expect(spawnSync).not.toHaveBeenCalled();
});

test("rejects an empty S3 region before making deployment changes", async () => {
  vi.mocked(readFileSync).mockReturnValue(
    Object.entries({ ...values, S3_MEDIA_REGION: "" })
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("S3_MEDIA_REGION"));
  expect(spawnSync).not.toHaveBeenCalled();
});
