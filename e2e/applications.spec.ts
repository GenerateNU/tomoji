import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-applications-"));
  execFileSync("bun", ["e2e/fixtures/applications-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "applications-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "applications.css"), "utf8");
});
test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

/** Serves the creator's Applications page with fixture rows; a fixture preview, not live data. */
async function serveApplications(page: Page, query = "") {
  await page.route("http://applications.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/fixture.js")
      await route.fulfill({
        contentType: "application/javascript",
        body: bundle,
      });
    else if (path === "/fixture.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
      });
  });
  await page.goto(`http://applications.test/${query}`);
}

test("a link with an offer's ID opens that offer on the Offers tab", async ({ page }) => {
  await serveApplications(page, "?application=application-offer");
  const dialog = page.getByRole("dialog", { name: /Claude Opus 5.5/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("tab", { name: /Offers/ })).toHaveAttribute("aria-selected", "true");
});

test("a link to an accepted offer opens it on the Accepted tab", async ({ page }) => {
  await serveApplications(page, "?application=application-accepted");
  const dialog = page.getByRole("dialog", { name: /Jamba Juice/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: /Accepted/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a link to a missing or someone else's offer says it's unavailable", async ({ page }) => {
  await serveApplications(page, "?application=gone");
  const dialog = page.getByRole("dialog", { name: "Offer unavailable" });
  await expect(dialog.getByText("This offer is no longer available.")).toBeVisible();
  await page.keyboard.press("Escape");
  // Nothing loaded to say which tab, so the page stays on its default.
  await expect(page.getByRole("tab", { name: /Applications/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("without a link the page opens on Applications with no offer showing", async ({ page }) => {
  await serveApplications(page);
  await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
