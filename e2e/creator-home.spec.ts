import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-creator-home-"));
  execFileSync("bun", [
    "e2e/fixtures/settings-build.mjs",
    fixtureDirectory,
    "e2e/fixtures/creator-home-entry.tsx",
  ]);
  bundle = readFileSync(join(fixtureDirectory, "creator-home-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "settings.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

async function openHome(page: Page, query = "") {
  await page.route("http://home.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/home.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/home.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/home.css"></head><body><div id="root"></div><script type="module" src="/home.js"></script></body></html>',
      });
  });
  await page.goto(`http://home.test/${query}`);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
}

function completionRing(page: Page) {
  return page.getByRole("progressbar", { name: "Profile completion", exact: true });
}

test("Complete my profile opens the editor, and saving updates the percentage", async ({
  page,
}) => {
  await openHome(page);
  // The fixture profile has a GitHub link and a country: 2 of 8 items.
  await expect(completionRing(page)).toHaveAttribute("aria-valuenow", "25");
  await expect(page.getByText("Your profile is 25% complete.")).toBeVisible();

  const trigger = page.getByRole("button", { name: "Complete my profile", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Your profile", exact: true });
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible();

  const birthdate = dialog.getByRole("group", { name: "Date of birth", exact: true });
  for (const [name, value] of [
    ["Month", "01"],
    ["Day", "15"],
    ["Year", "1995"],
  ] as const) {
    const field = birthdate.getByRole("textbox", { name, exact: true });
    await field.click();
    await field.fill(value);
  }
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  // Saving returns to view mode; closing shows the card has caught up.
  await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(completionRing(page)).toHaveAttribute("aria-valuenow", "38");
});

test("a complete profile hides the completion card", async ({ page }) => {
  await openHome(page);
  await expect(completionRing(page)).toBeVisible();

  await page.evaluate(() =>
    window.shellFixture.setProfile({
      profilePictureMediaId: "picture" as never,
      xId: "123456789",
      dateOfBirth: Date.UTC(1995, 0, 15),
      languages: ["english"],
      niches: ["generative-ai-llms"],
      skills: ["python"],
    }),
  );

  await expect(page.getByRole("heading", { name: "Complete your profile" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Opportunities for you" })).toBeVisible();
});

test("the opportunity row scrolls with its arrows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);
  const row = page.getByRole("list", { name: "Recommended opportunities", exact: true });
  await expect(row.getByRole("listitem")).toHaveCount(6);

  const previous = page.getByRole("button", { name: "Previous opportunities", exact: true });
  const next = page.getByRole("button", { name: "Next opportunities", exact: true });
  await expect(previous).toBeDisabled();
  // A disabled arrow keeps the normal pointer rather than the "not allowed" cursor.
  await expect(previous).toHaveCSS("cursor", "default");
  await next.click();
  await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(previous).toBeEnabled();

  await expect(page.getByRole("link", { name: "Browse new opportunities" })).toHaveAttribute(
    "href",
    "/opportunities",
  );
});

test("an empty feed explains there is nothing open yet", async ({ page }) => {
  await openHome(page, "?feed=empty");
  await expect(page.getByText("There are no open opportunities right now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next opportunities" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Browse new opportunities" })).toBeVisible();
});

test("creator home on desktop and mobile", async ({ page }, testInfo) => {
  for (const [name, size] of [
    ["desktop", { width: 1512, height: 982 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(size);
    await openHome(page);
    await expect(page.getByRole("list", { name: "Recommended opportunities" })).toBeVisible();
    // No sideways page scroll; only the row itself scrolls.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`creator-home-${name}.png`),
      fullPage: true,
    });
  }
});
