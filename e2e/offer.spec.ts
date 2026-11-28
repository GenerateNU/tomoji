import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-offer-"));
  execFileSync("bun", ["e2e/fixtures/offer-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "offer-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "offer.css"), "utf8");
});
test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

/** Renders the production offer dialog with synthetic data; no account actions. */
async function openOffer(page: Page, query = "") {
  await page.route("http://offer.test/**", async (route) => {
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
  await page.goto(`http://offer.test/${query}`);
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("accepted offers keep their status without a redundant footer action", async ({ page }) => {
  await openOffer(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Offer accepted", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Offer accepted", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
});

test("live offers still lead to terms and allow cancelling denial", async ({ page }) => {
  await openOffer(page, "?state=live");
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Terms & Conditions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept terms & conditions", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Are you sure you want to reject this offer?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accept terms & conditions", exact: true }),
  ).toBeEnabled();
});

for (const state of ["expired", "declined"]) {
  test(`${state} offers retain their existing disabled action`, async ({ page }) => {
    await openOffer(page, `?state=${state}`);
    await expect(page.getByRole("button", { name: `Offer ${state}`, exact: true })).toBeDisabled();
  });
}

test("accepted offer remains readable and closable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOffer(page);
  await expect(page.getByRole("dialog").getByText("Offer accepted", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button")).toHaveCount(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Open offer", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
