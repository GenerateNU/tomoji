import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));

const values = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "api_test",
  WORKOS_WEBHOOK_SECRET: "webhook_test",
  WORKOS_OPERATOR_ORG_ID: "org_tomoji_test",
  S3_MEDIA_BUCKET: "example-dev-media",
  S3_MEDIA_REGION: "us-east-1",
};

/** Serves these settings as the contents of .env.local. */
function mockEnvFile(settings: Record<string, string>) {
  vi.mocked(readFileSync).mockReturnValue(
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
}

/** Asserts the script copied this setting to the deployment. */
function expectCopied(key: string, value: string) {
  expect(spawnSync).toHaveBeenCalledWith(
    "bunx",
    ["convex", "env", "set", "--", key, value],
    expect.any(Object),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(true);
  mockEnvFile(values);
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
  for (const [key, value] of Object.entries(values)) expectCopied(key, value);
  expect(spawnSync).toHaveBeenCalledTimes(6);
});

// Without it no org is the staff org, so staff invites quietly create
// companies instead of operators.
test("rejects a missing operator org id before making deployment changes", async () => {
  mockEnvFile(
    Object.fromEntries(Object.entries(values).filter(([key]) => key !== "WORKOS_OPERATOR_ORG_ID")),
  );

  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("WORKOS_OPERATOR_ORG_ID"));
  expect(spawnSync).not.toHaveBeenCalled();
});

test("rejects a missing S3 bucket before making deployment changes", async () => {
  mockEnvFile(
    Object.fromEntries(Object.entries(values).filter(([key]) => key !== "S3_MEDIA_BUCKET")),
  );
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("S3_MEDIA_BUCKET"));
  expect(spawnSync).not.toHaveBeenCalled();
});

test("rejects an empty S3 region before making deployment changes", async () => {
  mockEnvFile({ ...values, S3_MEDIA_REGION: "" });
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("S3_MEDIA_REGION"));
  expect(spawnSync).not.toHaveBeenCalled();
});

test("copies a complete X OAuth configuration without requiring it for unrelated backend setup", async () => {
  const all = {
    ...values,
    X_CLIENT_ID: "x-client",
    X_CLIENT_SECRET: "x-secret",
    X_REDIRECT_URI: "http://localhost:3000/api/x/callback",
  };
  mockEnvFile(all);
  await import("../set-convex-env");
  for (const key of ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI"] as const) {
    expectCopied(key, all[key]);
  }
  expect(spawnSync).toHaveBeenCalledTimes(9);
});

test("rejects partial X configuration before making any deployment changes", async () => {
  mockEnvFile({ ...values, X_CLIENT_ID: "x-client" });
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("X_CLIENT_SECRET"));
  expect(spawnSync).not.toHaveBeenCalled();
});

test("copies a complete X encryption configuration without logging its key material", async () => {
  const encryption = {
    X_TOKEN_ENCRYPTION_KEYS: '{"v1":"test-only-key"}',
    X_TOKEN_ENCRYPTION_KEY_VERSION: "v1",
  };
  mockEnvFile({ ...values, ...encryption });
  await import("../set-convex-env");
  for (const [key, value] of Object.entries(encryption)) expectCopied(key, value);
  expect(console.error).not.toHaveBeenCalled();
});

test("copies X metrics sync settings when supplied together", async () => {
  const metrics = {
    X_BEARER_TOKEN: "test-bearer",
    X_METRICS_SYNC_ENABLED: "true",
  };
  mockEnvFile({ ...values, ...metrics });
  await import("../set-convex-env");
  for (const [key, value] of Object.entries(metrics)) expectCopied(key, value);
  expect(spawnSync).toHaveBeenCalledTimes(8);
});

test("skips X metrics sync settings when both are blank", async () => {
  mockEnvFile({ ...values, X_BEARER_TOKEN: "", X_METRICS_SYNC_ENABLED: "" });
  await import("../set-convex-env");
  expect(spawnSync).toHaveBeenCalledTimes(6);
});

test("copies an X bearer token without turning the metrics sync on", async () => {
  mockEnvFile({ ...values, X_BEARER_TOKEN: "test-bearer", X_METRICS_SYNC_ENABLED: "" });
  await import("../set-convex-env");
  expectCopied("X_BEARER_TOKEN", "test-bearer");
  expect(spawnSync).toHaveBeenCalledTimes(7);
});

test("copies a disabled metrics flag without a bearer token", async () => {
  mockEnvFile({ ...values, X_METRICS_SYNC_ENABLED: "false" });
  await import("../set-convex-env");
  expectCopied("X_METRICS_SYNC_ENABLED", "false");
  expect(spawnSync).toHaveBeenCalledTimes(7);
});

test("rejects an enabled metrics sync without a bearer token before making deployment changes", async () => {
  mockEnvFile({ ...values, X_METRICS_SYNC_ENABLED: "true" });
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("X_BEARER_TOKEN"));
  expect(spawnSync).not.toHaveBeenCalled();
});

test("rejects partial X encryption configuration before making deployment changes", async () => {
  mockEnvFile({ ...values, X_TOKEN_ENCRYPTION_KEY_VERSION: "v1" });
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(spawnSync).not.toHaveBeenCalled();
});

test("copies both AI credentials and the explicit enable flag without printing secret values", async () => {
  const all = {
    ...values,
    ASSEMBLYAI_API_KEY: "assembly-test",
    TYPESAFE_API_KEY: "jev-test",
    AI_REVIEW_ENABLED: "false",
  };
  vi.mocked(readFileSync).mockReturnValue(
    Object.entries(all)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  await import("../set-convex-env");
  for (const key of ["ASSEMBLYAI_API_KEY", "TYPESAFE_API_KEY", "AI_REVIEW_ENABLED"] as const) {
    expect(spawnSync).toHaveBeenCalledWith(
      "bunx",
      ["convex", "env", "set", "--", key, all[key]],
      expect.any(Object),
    );
  }
});

test("copies a secret that begins with a dash instead of reading it as a flag", async () => {
  // The Convex CLI parses a leading `-` as an option, so the script has to stop
  // option parsing with `--` before the key and value.
  mockEnvFile({ ...values, WORKOS_API_KEY: "-dash-leading-secret" });

  await import("../set-convex-env");

  expectCopied("WORKOS_API_KEY", "-dash-leading-secret");
});

test("rejects incomplete AI configuration before changing the deployment", async () => {
  vi.mocked(readFileSync).mockReturnValue(
    Object.entries({ ...values, AI_REVIEW_ENABLED: "true", ASSEMBLYAI_API_KEY: "assembly-test" })
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  await expect(import("../set-convex-env")).rejects.toThrow("exit 1");
  expect(spawnSync).not.toHaveBeenCalled();
});
