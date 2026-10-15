import { describe, expect, test } from "vitest";
import { FIRST_PAGE, nextPage, previousPage } from "./cursor-pages";

describe("cursor pages", () => {
  test("starts on page 1 with no cursor", () => {
    expect(FIRST_PAGE).toEqual({ cursors: [null], index: 0 });
  });

  test("moving forward records the cursor for the new page", () => {
    const page2 = nextPage(FIRST_PAGE, "cursor-2");
    expect(page2).toEqual({ cursors: [null, "cursor-2"], index: 1 });
  });

  test("going back and forward again reuses the recorded cursor", () => {
    const page2 = nextPage(FIRST_PAGE, "cursor-2");
    const back = previousPage(page2);
    expect(back.index).toBe(0);
    expect(nextPage(back, "cursor-2-again")).toEqual(page2);
  });

  test("stays on page 1 when going back from it", () => {
    expect(previousPage(FIRST_PAGE)).toEqual(FIRST_PAGE);
  });
});
