import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-opportunity-tags-"));
  execFileSync("bun", ["e2e/fixtures/opportunity-tags-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "opportunity-tags-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "opportunity-tags.css"), "utf8");
});
test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

/** Renders OpportunityTags with isolated catalog responses. */
async function openTags(page: Page, query = "") {
  await page.route("http://opportunity-tags.test/**", async (route) => {
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
  await page.goto(`http://opportunity-tags.test/${query}`);
  await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
}

test("tags show separate niche and skill catalogs", async ({ page }, testInfo) => {
  await openTags(page);
  const niches = page.getByRole("heading", { name: "Niches", exact: true }).locator("..");
  const skills = page.getByRole("heading", { name: "Skills", exact: true }).locator("..");
  await expect(niches.getByText("Database Management", { exact: true })).toBeVisible();
  await expect(skills.getByText("TypeScript", { exact: true })).toBeVisible();
  await expect(niches.getByText("TypeScript", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("opportunity-tags-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("catalog loading preserves the selected values", async ({ page }) => {
  await openTags(page, "?loading=1");
  await expect(page.getByText("databases", { exact: true })).toBeVisible();
  await expect(page.getByText("typescript", { exact: true })).toBeVisible();
});

test("long labels fit a narrow screen without overflowing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openTags(page);
  const niches = page.getByRole("heading", { name: "Niches", exact: true }).locator("..");
  const label = niches.getByText("Data Analytics & Business Intelligence", { exact: true });
  await label.scrollIntoViewIfNeeded();
  await expect(label).toBeVisible();
  await expect
    .poll(() =>
      label.evaluate((node) => ({
        clipped: node.scrollWidth > node.clientWidth + 1,
        outsideSection:
          node.getBoundingClientRect().right >
          node.parentElement!.getBoundingClientRect().right + 1,
      })),
    )
    .toEqual({ clipped: false, outsideSection: false });
  await page.screenshot({
    path: testInfo.outputPath("opportunity-tags-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});
