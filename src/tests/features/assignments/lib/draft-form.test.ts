import { describe, expect, test } from "vitest";
import { validateDraft } from "@/features/assignments/lib/draft-form";

describe("validateDraft", () => {
  test("asks for notes when they are missing", () => {
    expect(validateDraft({ notes: "  ", caption: "Launch day", hasVideo: false })).toEqual({
      notes: "Add draft notes.",
    });
  });

  test("asks for a caption or a video when both are missing", () => {
    expect(validateDraft({ notes: "First cut", caption: "  ", hasVideo: false })).toEqual({
      content: "Add a caption or a video.",
    });
  });

  test.each([
    ["a caption", { caption: "Launch day", hasVideo: false }],
    ["a video", { caption: "", hasVideo: true }],
    ["both", { caption: "Launch day", hasVideo: true }],
  ])("accepts notes with %s", (_, content) => {
    expect(validateDraft({ notes: "First cut", ...content })).toEqual({});
  });
});
