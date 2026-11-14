import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-opportunity-feed-"));
  execFileSync("bun", ["e2e/fixtures/opportunity-feed-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "opportunity-feed-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "opportunity-feed.css"), "utf8");
});
test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

/** Renders the creator feed with fixture briefs; labelled a fixture preview, not live data. */
async function openFeed(page: Page, query = "") {
  await page.route("http://opportunity-feed.test/**", async (route) => {
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
  await page.goto(`http://opportunity-feed.test/${query}`);
  await expect(page.getByRole("heading", { name: "Opportunities", level: 1 })).toBeVisible();
}

test("cards show the creator's progress and the next action", async ({ page }) => {
  await openFeed(page);
  await expect(
    page.getByRole("button", { name: "View application: Claude Opus 5.5" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "View opportunity: GPT-4 Turbo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim spot: Bard AI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View opportunity: v0 by Vercel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply: Copilot Workspace" })).toBeVisible();
  await expect(page.getByText("Claimed spot")).toBeVisible();
});

test("switches between grid and list views", async ({ page }) => {
  await openFeed(page);
  await page.getByRole("radio", { name: "List view" }).click();
  await expect(page.getByRole("columnheader", { name: "Compensation" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "$450 • $3.25 CPM" })).toBeVisible();
});

test("shows a skeleton while loading and a message when nothing is open", async ({ page }) => {
  await openFeed(page, "?loading");
  await expect(page.getByLabel("Loading opportunities")).toBeVisible();
  await openFeed(page, "?empty");
  await expect(page.getByText("There are no open opportunities right now.")).toBeVisible();
});
