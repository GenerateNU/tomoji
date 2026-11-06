import type { ConvexError, Value } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";
import { getXPostMetrics, readXMetricsConfig } from "../../lib/xApi";
import { expectApiError } from "../helpers";

afterEach(() => vi.unstubAllGlobals());

const token = "test-bearer";

/** A post as X's data dictionary documents it, with overridable counts. */
function xPost(id: string, metrics: Record<string, unknown> = {}) {
  return {
    id,
    text: "post",
    public_metrics: {
      retweet_count: 7,
      reply_count: 3,
      like_count: 38,
      quote_count: 1,
      bookmark_count: 2,
      impression_count: 1250,
      ...metrics,
    },
  };
}

function stubX(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** The error a call rejects with; fails the test if the call succeeds. */
async function failure(call: Promise<unknown>): Promise<ConvexError<Value>> {
  try {
    await call;
  } catch (error) {
    return error as ConvexError<Value>;
  }
  throw new Error("Expected the call to fail");
}

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

test("the bearer token is trimmed so pasted whitespace can't break the header", () => {
  expect(
    readXMetricsConfig({ X_METRICS_SYNC_ENABLED: "true", X_BEARER_TOKEN: "  token\n" }),
  ).toEqual({ enabled: true, bearerToken: "token" });
});

test("looks up posts with the app token and maps their public counts", async () => {
  const fetch = stubX({ data: [xPost("1"), xPost("2", { impression_count: 0 })] });
  const result = await getXPostMetrics(token, ["1", "2"]);
  expect(fetch).toHaveBeenCalledWith(
    "https://api.x.com/2/tweets?ids=1,2&tweet.fields=public_metrics",
    expect.objectContaining({
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
    }),
  );
  expect(result).toEqual({
    found: [
      { xPostId: "1", likes: 38, comments: 3, reposts: 7, views: 1250 },
      { xPostId: "2", likes: 38, comments: 3, reposts: 7, views: 0 },
    ],
    missing: [],
  });
});

/** An entry in X's `errors` list for a post it left out. */
function xProblem(id: string, problem: string) {
  return {
    resource_id: id,
    resource_type: "tweet",
    title: "Problem",
    detail: `Problem with post ${id}`,
    type: `https://api.x.com/2/problems/${problem}`,
  };
}

test("posts X leaves out are missing with the reason X gives", async () => {
  stubX({
    data: [xPost("1")],
    errors: [xProblem("2", "resource-not-found"), xProblem("3", "not-authorized-for-resource")],
  });
  expect(await getXPostMetrics(token, ["1", "2", "3", "4"])).toEqual({
    found: [{ xPostId: "1", likes: 38, comments: 3, reposts: 7, views: 1250 }],
    missing: [
      { xPostId: "2", reason: "not_found" },
      { xPostId: "3", reason: "not_authorized" },
      { xPostId: "4", reason: "not_returned" },
    ],
  });

  // X may omit `data` entirely when nothing matched.
  stubX({ errors: [xProblem("5", "resource-not-found")] });
  expect(await getXPostMetrics(token, ["5"])).toEqual({
    found: [],
    missing: [{ xPostId: "5", reason: "not_found" }],
  });
});

test("an unreadable errors list only loses the reason", async () => {
  for (const errors of ["oops", [null, "x", { resource_id: 6, type: 1 }]]) {
    stubX({ data: [xPost("1")], errors });
    expect(await getXPostMetrics(token, ["1", "6"])).toMatchObject({
      missing: [{ xPostId: "6", reason: "not_returned" }],
    });
  }
});

test("stored ids X would reject are skipped without failing the batch", async () => {
  const fetch = stubX({ data: [xPost("1")] });
  const ids = ["1", "12345678901234567890", "0123", "abc"];
  expect(await getXPostMetrics(token, ids)).toEqual({
    found: [{ xPostId: "1", likes: 38, comments: 3, reposts: 7, views: 1250 }],
    missing: [
      { xPostId: "12345678901234567890", reason: "invalid_id" },
      { xPostId: "0123", reason: "invalid_id" },
      { xPostId: "abc", reason: "invalid_id" },
    ],
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.x.com/2/tweets?ids=1&tweet.fields=public_metrics",
    expect.any(Object),
  );

  const unused = stubX({ data: [] });
  expect(await getXPostMetrics(token, ["0"])).toEqual({
    found: [],
    missing: [{ xPostId: "0", reason: "invalid_id" }],
  });
  expect(unused).not.toHaveBeenCalled();
});

test("a full batch of 100 posts is looked up in one request", async () => {
  const ids = Array.from({ length: 100 }, (_, i) => String(i + 1));
  const fetch = stubX({ data: ids.map((id) => xPost(id)) });
  const result = await getXPostMetrics(token, ids);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    `https://api.x.com/2/tweets?ids=${ids.join(",")}&tweet.fields=public_metrics`,
    expect.any(Object),
  );
  expect(result.found).toHaveLength(100);
  expect(result.missing).toEqual([]);
});

test("caller bugs in the id list are rejected before calling X", async () => {
  const fetch = stubX({ data: [] });
  const tooMany = Array.from({ length: 101 }, (_, i) => String(i + 1));
  for (const ids of [[], tooMany, ["1", "1"]]) {
    await expectApiError(() => getXPostMetrics(token, ids), "invalid_state", "x_post_ids_invalid");
  }
  expect(fetch).not.toHaveBeenCalled();
});

test("a post with unusable counts is malformed without failing the batch", async () => {
  stubX({
    data: [
      xPost("1"),
      // JSON drops undefined, so X's response has no impression_count at all.
      xPost("2", { impression_count: undefined }),
      xPost("3", { like_count: -1 }),
      xPost("4", { impression_count: 1.5 }),
      xPost("5", { reply_count: "3" }),
      { id: "6", text: "post" },
    ],
  });
  const result = await getXPostMetrics(token, ["1", "2", "3", "4", "5", "6"]);
  expect(result.found.map((post) => post.xPostId)).toEqual(["1"]);
  expect(result.missing).toEqual(
    ["2", "3", "4", "5", "6"].map((xPostId) => ({ xPostId, reason: "malformed" })),
  );
});

test("responses that can't be matched to requested posts fail", async () => {
  for (const body of [
    { data: { id: "1" } },
    { data: ["1"] },
    { data: [{ text: "post" }] },
    { data: [xPost("9")] },
    { data: [xPost("1"), xPost("1")] },
  ]) {
    stubX(body);
    await expectApiError(() => getXPostMetrics(token, ["1"]), "upstream_failure");
  }
});

test("rate limits are distinguishable from other failures", async () => {
  stubX({ errors: [{ code: 88, message: "Rate limit exceeded" }] }, 429);
  await expectApiError(() => getXPostMetrics(token, ["1"]), "upstream_failure", "x_rate_limited");

  stubX({ title: "Service Unavailable" }, 503);
  const unavailable = await failure(getXPostMetrics(token, ["1"]));
  expect(unavailable.data).toEqual({
    code: "upstream_failure",
    message: "Upstream service failed",
  });

  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`socket closed for ${token}`)));
  const error = await failure(getXPostMetrics(token, ["1"]));
  expect(error.data).toMatchObject({ code: "upstream_failure" });
  expect(`${error.message} ${JSON.stringify(error.data)}`).not.toContain(token);
});

test("a rate limit says when X will accept requests again", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "x-rate-limit-reset": "1705420800" } }),
      ),
  );
  const limited = await failure(getXPostMetrics(token, ["1"]));
  expect(limited.data).toMatchObject({ reason: "x_rate_limited", retryAt: 1705420800000 });

  for (const reset of ["", "soon", "-5", "1.5"]) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("", { status: 429, headers: { "x-rate-limit-reset": reset } }),
        ),
    );
    const unknown = await failure(getXPostMetrics(token, ["1"]));
    expect(unknown.data).toEqual({
      code: "upstream_failure",
      message: "Upstream service failed",
      reason: "x_rate_limited",
    });
  }
});
