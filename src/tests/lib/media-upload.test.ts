import { ConvexError } from "convex/values";
import { expect, test, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { createMediaUpload, type UploadActions } from "@/lib/media-upload";

function setupUpload(completionError: Error) {
  const firstId = "first-upload" as Id<"mediaUploads">;
  const secondId = "second-upload" as Id<"mediaUploads">;
  const grant = {
    url: "https://uploads.example.test",
    fields: { key: "first-upload" },
    expiresAt: Date.now() + 60_000,
  };
  const requestUpload = vi
    .fn<UploadActions["requestUpload"]>()
    .mockResolvedValueOnce({ ...grant, uploadId: firstId })
    .mockResolvedValueOnce({ ...grant, uploadId: secondId, fields: { key: "second-upload" } });
  const completeUpload = vi
    .fn<UploadActions["completeUpload"]>()
    .mockRejectedValueOnce(completionError)
    .mockImplementation(async ({ uploadId }) => ({ mediaId: uploadId, kind: "profile-picture" }));
  const post = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  const upload = createMediaUpload(
    new File(["image"], "photo.png", { type: "image/png" }),
    { kind: "profile-picture", timeoutMs: 60_000 },
    { requestUpload, completeUpload },
    post,
  );
  return { upload, requestUpload, completeUpload, post, firstId, secondId };
}

test("a confirmed expired completion gets a fresh upload grant on retry", async () => {
  const expired = new ConvexError({ code: "invalid_state", reason: "upload_expired" });
  const { upload, requestUpload, completeUpload, post, firstId, secondId } = setupUpload(expired);

  await expect(upload.save()).rejects.toBe(expired);
  await expect(upload.save()).resolves.toBe(secondId);

  expect(requestUpload).toHaveBeenCalledTimes(2);
  expect(post).toHaveBeenCalledTimes(2);
  expect(completeUpload.mock.calls).toEqual([[{ uploadId: firstId }], [{ uploadId: secondId }]]);
  expect((post.mock.calls[1][1]?.body as FormData).get("key")).toBe("second-upload");
});

test.each([
  { name: "lost response", error: new Error("Connection closed") },
  { name: "upstream failure", error: new ConvexError({ code: "upstream_failure" }) },
  {
    name: "another invalid state",
    error: new ConvexError({ code: "invalid_state", reason: "upload_mismatch" }),
  },
])("a $name preserves the completed transfer for retry", async ({ error }) => {
  const { upload, requestUpload, completeUpload, post, firstId } = setupUpload(error);

  await expect(upload.save()).rejects.toBe(error);
  await expect(upload.save()).resolves.toBe(firstId);

  expect(requestUpload).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(completeUpload.mock.calls).toEqual([[{ uploadId: firstId }], [{ uploadId: firstId }]]);
});
