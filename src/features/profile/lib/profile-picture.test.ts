import { describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { createProfilePictureUpload, validateProfilePicture } from "./profile-picture";

const uploadId = "upload-1" as Id<"mediaUploads">;
const file = new File(["image bytes"], "profile.png", { type: "image/png" });

function setup() {
  const actions = {
    requestUpload: vi.fn().mockResolvedValue({
      uploadId,
      url: "https://uploads.example.com/",
      fields: { key: "staging/photo", policy: "signed-policy" },
      expiresAt: Date.now() + 900_000,
    }),
    completeUpload: vi.fn().mockResolvedValue({ mediaId: uploadId, kind: "profile-picture" }),
  };
  const post = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  return { actions, post, upload: createProfilePictureUpload(file, actions, post) };
}

describe("profile picture validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("allows %s up to 2 MiB", (type) => {
    expect(validateProfilePicture({ type, size: 2 * 1024 * 1024 })).toBeNull();
  });

  it("rejects unsupported, empty, and oversized files before an upload", () => {
    expect(validateProfilePicture({ type: "image/svg+xml", size: 20 })).toMatch(
      /JPEG, PNG, or WebP/,
    );
    expect(validateProfilePicture({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(validateProfilePicture({ type: "image/png", size: 2 * 1024 * 1024 + 1 })).toMatch(
      /2 MB/,
    );
  });
});

describe("profile picture upload", () => {
  it("posts the signed fields and file before attaching the picture", async () => {
    const { actions, post, upload } = setup();
    const phases: string[] = [];
    post.mockImplementationOnce(async (_url, options) => {
      expect(actions.completeUpload).not.toHaveBeenCalled();
      const body = options?.body as FormData;
      expect([...body.keys()]).toEqual(["key", "policy", "file"]);
      expect(body.get("key")).toBe("staging/photo");
      expect(body.get("file")).toBe(file);
      expect(options?.headers).toBeUndefined();
      return new Response(null, { status: 204 });
    });

    expect(actions.requestUpload).not.toHaveBeenCalled();
    await expect(upload.save((phase) => phases.push(phase))).resolves.toBe(uploadId);
    expect(actions.requestUpload).toHaveBeenCalledWith({
      kind: "profile-picture",
      contentType: "image/png",
    });
    expect(actions.completeUpload).toHaveBeenCalledWith({ uploadId });
    expect(phases).toEqual(["uploading", "saving"]);
  });

  it("does not attach a failed S3 upload and allows retrying it", async () => {
    const { actions, post, upload } = setup();
    post.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(upload.save()).rejects.toThrow(/upload/i);
    expect(actions.completeUpload).not.toHaveBeenCalled();
    await expect(upload.save()).resolves.toBe(uploadId);
    expect(post).toHaveBeenCalledTimes(2);
    expect(actions.completeUpload).toHaveBeenCalledTimes(1);
  });

  it("retries an ambiguous completion with the same upload ID without reuploading", async () => {
    const { actions, post, upload } = setup();
    actions.completeUpload.mockRejectedValueOnce(new Error("Response lost"));
    await expect(upload.save()).rejects.toThrow("Response lost");
    await expect(upload.save()).resolves.toBe(uploadId);
    expect(actions.requestUpload).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(actions.completeUpload.mock.calls).toEqual([[{ uploadId }], [{ uploadId }]]);
  });

  it("shares an in-flight save instead of starting duplicate uploads", async () => {
    const { actions, post, upload } = setup();
    const first = upload.save();
    const second = upload.save();
    await expect(Promise.all([first, second])).resolves.toEqual([uploadId, uploadId]);
    expect(actions.requestUpload).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(actions.completeUpload).toHaveBeenCalledTimes(1);
  });

  it("does not attach a picture when the caller leaves during the transfer", async () => {
    const { actions, post, upload } = setup();
    const controller = new AbortController();
    post.mockImplementationOnce(async () => {
      controller.abort();
      return new Response(null, { status: 204 });
    });
    await expect(upload.save(undefined, controller.signal)).rejects.toThrow();
    expect(actions.completeUpload).not.toHaveBeenCalled();
  });

  it("does not start a transfer after cancellation while requesting the grant", async () => {
    const { actions, post, upload } = setup();
    const controller = new AbortController();
    const grant = await actions.requestUpload();
    actions.requestUpload.mockImplementationOnce(async () => {
      controller.abort();
      return grant;
    });
    await expect(upload.save(undefined, controller.signal)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
    expect(actions.completeUpload).not.toHaveBeenCalled();
  });

  it("requests a fresh grant when a failed transfer's grant has expired", async () => {
    const { actions, post, upload } = setup();
    post.mockResolvedValueOnce(new Response(null, { status: 403 }));
    actions.requestUpload.mockResolvedValueOnce({
      uploadId,
      url: "https://uploads.example.com/",
      fields: { key: "staging/photo" },
      expiresAt: Date.now() - 1,
    });
    await expect(upload.save()).rejects.toThrow();
    await expect(upload.save()).resolves.toBe(uploadId);
    expect(actions.requestUpload).toHaveBeenCalledTimes(2);
  });
});
