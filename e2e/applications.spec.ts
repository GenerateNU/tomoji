import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-applications-tests-"));
  execFileSync("bun", ["e2e/fixtures/applications-build.mjs", directory]);
  bundle = readFileSync(join(directory, "applications-entry.js"), "utf8");
  css = readFileSync(join(directory, "applications.css"), "utf8");
});

test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

/** Opens the real components with isolated service responses, never a live Convex account. */
async function openFeed(page: Page) {
  await page.route("http://applications.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/app.js") {
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    } else if (path === "/app.css") {
      await route.fulfill({ contentType: "text/css", body: css });
    } else if (path.startsWith("/icons/opportunities/") && path.endsWith(".svg")) {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: readFileSync(join("public", path)),
      });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      });
    }
  });
  await page.goto("http://applications.test/");
  await expect(
    page.getByRole("heading", { name: "Opportunities", exact: true }).first(),
  ).toBeVisible();
}

test("grid Apply opens the selected opportunity and submits a trimmed note", async ({ page }) => {
  await openFeed(page);
  await page
    .getByRole("article")
    .filter({ hasText: "Agent tutorial" })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Agent tutorial" })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("application-modal.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.getByLabel("Note").fill("  I build agent tutorials.  ");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByText("Application sent", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.applicationsFixture.calls)).toEqual([
    {
      name: "applications:create",
      args: { opportunityId: "opportunity-b", note: "I build agent tutorials." },
    },
  ]);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("article")
    .filter({ hasText: "Developer tools launch" })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(dialog.getByRole("heading", { name: "Developer tools launch" })).toBeVisible();
});

test("list Apply works with the keyboard and closing resets the form", async ({ page }) => {
  await openFeed(page);
  await page.getByRole("button", { name: "List view" }).click();
  const row = page.getByRole("row").filter({ hasText: "Developer tools launch" });
  const apply = row.getByRole("button", { name: "Apply", exact: true });
  await apply.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.getByLabel("Note").fill("Unsaved note");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(apply).toBeFocused();
  await apply.click();
  await expect(dialog.getByRole("heading", { name: "Developer tools launch" })).toBeVisible();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByLabel("Note")).toHaveValue("");
  expect(await page.evaluate(() => window.applicationsFixture.calls)).toEqual([]);
});

test("ungated opportunities never open the application form", async ({ page }) => {
  await openFeed(page);
  await expect(page.getByRole("button", { name: "View opportunity" })).toBeDisabled();
  await page.getByRole("button", { name: "List view" }).click();
  const row = page.getByRole("row").filter({ hasText: "Open opportunity" });
  await expect(row.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a failed application keeps the note and does not show success", async ({ page }) => {
  await openFeed(page);
  await page.evaluate(() => {
    window.applicationsFixture.failNextApplication = true;
  });
  await page
    .getByRole("article")
    .filter({ hasText: "Agent tutorial" })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await dialog.getByLabel("Note").fill("My application note");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByText("You've already applied to this opportunity.")).toBeVisible();
  await expect(dialog.getByLabel("Note")).toHaveValue("My application note");
  await expect(dialog.getByText("Application sent", { exact: true })).toHaveCount(0);
});

test("the existing modal remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFeed(page);
  await page
    .getByRole("article")
    .filter({ hasText: "Agent tutorial" })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Agent tutorial" })).toBeVisible();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByLabel("Note")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("application-note-mobile.png"),
    animations: "disabled",
  });
});
