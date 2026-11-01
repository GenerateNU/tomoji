import { afterEach, expect, test, vi } from "vitest";
import { getTranscription, submitTranscription } from "../../../lib/ai/assemblyAi";
import { assemblyTranscriptResponse, expectApiError } from "../../helpers";

afterEach(() => vi.unstubAllGlobals());

test("submits the signed video URL with Universal-2 and returns the job ID", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: "transcript-1" }));
  vi.stubGlobal("fetch", fetch);
  const videoUrl = "https://media.example.com/video.mp4?signature=test";
  expect(await submitTranscription("test-key", videoUrl)).toBe("transcript-1");
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://api.assemblyai.com/v2/transcript");
  expect(request.headers.Authorization).toBe("test-key");
  expect(JSON.parse(request.body)).toEqual({
    audio_url: videoUrl,
    speech_models: ["universal-2"],
    language_code: "en_us",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("normalizes completed transcripts while retaining word timestamps and the actual model", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(assemblyTranscriptResponse()));
  expect(await getTranscription("test-key", "transcript-1")).toEqual({
    id: "transcript-1",
    status: "completed",
    text: "Try Driftwood.",
    words: [
      { text: "Try", startMs: 100, endMs: 300 },
      { text: "Driftwood.", startMs: 300, endMs: 900 },
    ],
    durationSeconds: 2,
    model: "universal-2",
  });
});

test("returns pending job states without polling again", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(assemblyTranscriptResponse({ status: "queued" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ status: "processing" }));
  vi.stubGlobal("fetch", fetch);
  expect(await getTranscription("test-key", "transcript-1")).toEqual({
    id: "transcript-1",
    status: "queued",
  });
  expect(await getTranscription("test-key", "transcript-1")).toEqual({
    id: "transcript-1",
    status: "processing",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("represents silence as an empty transcript rather than an approval or provider failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(assemblyTranscriptResponse({ text: null, words: null })),
  );
  expect(await getTranscription("test-key", "transcript-1")).toMatchObject({
    status: "completed",
    text: "",
    words: [],
  });
});

test("returns terminal job errors without retaining provider messages or source URLs", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        assemblyTranscriptResponse({ status: "error", error: "private signed URL" }),
      ),
  );
  expect(await getTranscription("test-key", "transcript-1")).toEqual({
    id: "transcript-1",
    status: "error",
  });
});

test("rejects reversed word timestamps", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        assemblyTranscriptResponse({ words: [{ text: "Try", start: 900, end: 100 }] }),
      ),
  );
  await expectApiError(
    () => getTranscription("test-key", "transcript-1"),
    "upstream_failure",
    "invalid_response",
  );
});

test("rejects results from another job and unknown statuses", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "other-job" }))
      .mockResolvedValueOnce(assemblyTranscriptResponse({ status: "approved" })),
  );
  await expectApiError(() => getTranscription("test-key", "transcript-1"), "upstream_failure");
  await expectApiError(() => getTranscription("test-key", "transcript-1"), "upstream_failure");
});

test("rejects unsafe video URLs before sending a provider request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expectApiError(
    () => submitTranscription("test-key", "http://example.com/video"),
    "invalid_state",
  );
  await expectApiError(
    () => submitTranscription("test-key", "https://user:password@example.com/video"),
    "invalid_state",
  );
  expect(fetch).not.toHaveBeenCalled();
});
