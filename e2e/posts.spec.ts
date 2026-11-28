import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Fixture-based: Convex reads are stubbed in e2e/fixtures/posts-convex.ts.
let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-posts-hifis-"));
  execFileSync("bun", ["e2e/fixtures/posts-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "posts-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "posts.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

async function openPosts(page: Page, query = "") {
  await page.route("http://posts.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/posts.js") {
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    } else if (path === "/posts.css") {
      await route.fulfill({ contentType: "text/css", body: css });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/posts.css"></head><body><div id="root"></div><script type="module" src="/posts.js"></script></body></html>',
      });
    }
  });
  await page.goto(`http://posts.test/posts${query}`);
  await expect(page.getByRole("heading", { name: "Posts", exact: true })).toBeVisible();
}

test("shows recent posts, totals and every post", async ({ page }) => {
  await openPosts(page);
  await expect(page.getByText("Updated 2 hours ago from X")).toBeVisible();
  await expect(page.getByRole("link", { name: "Posts" }).first()).toHaveAttribute("href", "/posts");

  const recent = page.getByRole("region", { name: "Recent Posts" });
  await expect(recent.getByRole("button", { name: /View details/ })).toHaveCount(3);

  // Likes are a current total: no range and no chart.
  await expect(page.getByRole("paragraph").filter({ hasText: /^43,885$/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Analytics range" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Views" }).click();
  await expect(page.getByRole("paragraph").filter({ hasText: /^809,044$/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Analytics range" })).toBeVisible();
  await page.getByRole("tab", { name: "Earnings" }).click();
  await expect(page.getByRole("paragraph").filter({ hasText: /^\$1,858\.95$/ })).toBeVisible();

  const table = page.getByRole("table", { name: "All posts" });
  const titles = () => table.locator("tbody tr").locator("button").first();
  await expect(titles()).toHaveText("Research Faster: Summarizing 50 Papers in an Afternoon");
  await table.getByRole("button", { name: "Earnings" }).click();
  await expect(titles()).toHaveText("Research Faster: Summarizing 50 Papers in an Afternoon");
  await table.getByRole("button", { name: "Earnings" }).click();
  await expect(titles()).toHaveText("Shipping an App to the Edge in 10 Minutes");
});

test("opens a post's details from the table and links to its assignment", async ({ page }) => {
  await openPosts(page);
  await page
    .getByRole("table", { name: "All posts" })
    .getByRole("button", { name: "Refactoring a Legacy Codebase Live with Copilot", exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Refactoring a Legacy Codebase Live with Copilot" }),
  ).toBeVisible();
  await expect(dialog.getByText("$500 • $4 CPM • $5,000 Payment Cap")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "View Assignment Details" })).toHaveAttribute(
    "href",
    "/assignments/assignment-copilot",
  );
  await expect(dialog.getByRole("link", { name: /View Post on X/ })).toHaveAttribute(
    "href",
    "https://x.com/zahratech/status/1843000000000000002",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("explains an empty page", async ({ page }) => {
  await openPosts(page, "?empty");
  await expect(page.getByText("Nothing to see here!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to assignments" })).toHaveAttribute(
    "href",
    "/assignments",
  );
  await expect(page.getByText("No posts yet.")).toBeVisible();
});

test("captures desktop and mobile layouts", async ({ page }, testInfo) => {
  await openPosts(page);
  await page.screenshot({ path: testInfo.outputPath("posts-desktop.png"), fullPage: true });
  await page.getByRole("region", { name: "Recent Posts" }).getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("post-detail-desktop.png") });
  await page.getByRole("dialog").getByRole("tab", { name: "Views" }).click();
  await page
    .getByRole("dialog")
    .getByText("Total Views", { exact: true })
    .last()
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("post-detail-views-desktop.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Views" }).click();
  await page.getByRole("tab", { name: "Views" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("posts-views-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("posts-mobile.png") });
  await page.getByRole("table", { name: "All posts" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("posts-table-mobile.png") });
});
