import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-assignment-layout-"));
  execFileSync("bun", ["e2e/fixtures/assignment-layout-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "assignment-layout-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "assignment-layout.css"), "utf8");
});
test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

/** Exercises production assignment views with synthetic rounds and no provider calls. */
async function openAssignment(page: Page, query = "") {
  await page.route("http://assignment-layout.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/fixture.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/fixture.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
      });
  });
  await page.goto(`http://assignment-layout.test/${query}`);
  await expect(page.getByRole("dialog").first()).toBeVisible();
}

for (const width of [390, 1512]) {
  for (const state of ["pending", "approved"]) {
    test(`${state} submission card remains readable and opens at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 982 });
      await openAssignment(page, `?state=${state}`);
      const brief = page.getByRole("dialog").first();
      const action = brief.getByRole("button", { name: "View submission", exact: true });
      const status = brief
        .getByText(state === "pending" ? "In review" : "Approved", { exact: true })
        .first();
      await expect(status).toBeVisible();
      await expect(action).toBeVisible();
      const statusBox = await status.boundingBox();
      const actionBox = await action.boundingBox();
      if (width === 1512) expect(actionBox!.x).toBeGreaterThan(statusBox!.x + statusBox!.width);
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(width - 16);
      const overlaps =
        actionBox!.x < statusBox!.x + statusBox!.width &&
        actionBox!.y < statusBox!.y + statusBox!.height &&
        actionBox!.x + actionBox!.width > statusBox!.x &&
        actionBox!.y + actionBox!.height > statusBox!.y;
      expect(overlaps).toBe(false);
      await action.click();
      await expect(page.getByRole("dialog").last()).toContainText("Submission details");
      await page.keyboard.press("Escape");
      await expect(action).toBeFocused();
    });
  }
  test(`history keeps its edges and long feedback inside the brief at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 982 });
    await openAssignment(page, "?state=changesRequested");
    const brief = page.getByRole("dialog").first();
    const toggle = brief.getByRole("button", { name: "Submission history", exact: true });
    await toggle.click();
    const history = brief
      .getByRole("list")
      .filter({ has: page.getByText("Revised draft: show the result first.", { exact: true }) });
    await expect(history.getByRole("listitem")).toHaveCount(3);
    const box = await history.boundingBox();
    const content = await brief
      .getByRole("heading", { name: "Content requirements", exact: true })
      .boundingBox();
    expect(Math.abs(box!.x - content!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.x + box!.width - content!.x - content!.width)).toBeLessThanOrEqual(1);
    await expect.poll(() => history.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await brief.getByRole("button", { name: "Hide submission history", exact: true }).click();
    await expect(history).toBeHidden();
  });
}
