import { expect, test } from "vitest";
import { readXMetricsConfig } from "../../lib/xApi";

test("metrics sync stays off unless explicitly enabled", () => {
  expect(readXMetricsConfig({})).toEqual({ enabled: false });
  expect(readXMetricsConfig({ X_BEARER_TOKEN: "token" })).toEqual({
    enabled: false,
  });
  for (const value of ["", "false", "1", "yes", "TRUE", " true"]) {
    expect(
      readXMetricsConfig({
        X_METRICS_SYNC_ENABLED: value,
        X_BEARER_TOKEN: "token",
      }),
    ).toEqual({ enabled: false });
  }
});

test("enabled metrics sync requires a bearer token", () => {
  expect(() => readXMetricsConfig({ X_METRICS_SYNC_ENABLED: "true" })).toThrow(
    /x_bearer_token_missing/,
  );
  expect(() =>
    readXMetricsConfig({
      X_METRICS_SYNC_ENABLED: "true",
      X_BEARER_TOKEN: "  ",
    }),
  ).toThrow(/x_bearer_token_missing/);
});

test("enabled metrics sync returns the bearer token", () => {
  expect(
    readXMetricsConfig({
      X_METRICS_SYNC_ENABLED: "true",
      X_BEARER_TOKEN: "token",
    }),
  ).toEqual({
    enabled: true,
    bearerToken: "token",
  });
});
