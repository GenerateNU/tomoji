import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-settings-tests-"));
  execFileSync("bun", ["e2e/fixtures/settings-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "settings-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "settings.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

// Browser-component tests: real Settings components, isolated service responses.
// These deliberately do not authenticate or write to a development account.
async function openSettings(page: Page, query = "") {
  await page.route("http://settings.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/settings.js") {
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    } else if (path === "/settings.css") {
      await route.fulfill({ contentType: "text/css", body: css });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/settings.css"></head><body><div id="root"></div><script type="module" src="/settings.js"></script></body></html>',
      });
    }
  });
  await page.goto(`http://settings.test/${query}`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
}

test("discarding GitHub edits restores the saved link without a mutation", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit GitHub profile" }).click();
  await page.getByLabel("GitHub profile URL").fill("https://github.com/new-profile");
  await page.getByRole("button", { name: "Discard GitHub changes" }).click();
  await expect(page.getByRole("link", { name: /https:\/\/github.com\/zahra/ })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
});

test("saving and clearing GitHub changes persist through the existing mutation", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit GitHub profile" }).click();
  await page.getByLabel("GitHub profile URL").fill("https://github.com/new-profile");
  await page.getByRole("button", { name: "Save GitHub profile" }).click();
  await expect(page.getByText("GitHub profile saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /https:\/\/github.com\/new-profile/ })).toBeVisible();

  await page.getByRole("button", { name: "Edit GitHub profile" }).click();
  await page.getByLabel("GitHub profile URL").fill("");
  await page.getByRole("button", { name: "Save GitHub profile" }).click();
  await expect(page.getByText("No GitHub profile added yet.")).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([
    { name: "creators:update", args: { githubLink: "https://github.com/new-profile" } },
    { name: "creators:update", args: { githubLink: null } },
  ]);
});

test("a reactive profile update does not overwrite an unsaved GitHub draft", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit GitHub profile" }).click();
  await page.getByLabel("GitHub profile URL").fill("https://github.com/my-draft");
  await page.evaluate(() =>
    window.settingsFixture.setGithubLink("https://github.com/updated-elsewhere"),
  );
  await expect(page.getByLabel("GitHub profile URL")).toHaveValue("https://github.com/my-draft");
  await page.getByRole("button", { name: "Discard GitHub changes" }).click();
  await expect(
    page.getByRole("link", { name: /https:\/\/github.com\/updated-elsewhere/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
});

test("invalid GitHub input is rejected, and a failed save preserves the draft for retry", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit GitHub profile" }).click();
  const field = page.getByLabel("GitHub profile URL");
  await field.fill("https://example.com/not-github");
  await page.getByRole("button", { name: "Save GitHub profile" }).click();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toBeFocused();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);

  await field.fill("https://github.com/new-profile");
  await page.evaluate(() => window.settingsFixture.failNext("creators:update"));
  await page.getByRole("button", { name: "Save GitHub profile" }).click();
  await expect(page.getByRole("alert")).toContainText("Something went wrong");
  await expect(field).toHaveValue("https://github.com/new-profile");
  await page.getByRole("button", { name: "Save GitHub profile" }).click();
  await expect(page.getByText("GitHub profile saved.", { exact: true })).toBeVisible();
});

for (const role of ["company", "operator"]) {
  test(`${role} accounts do not request creator data or show creator forms`, async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openSettings(page, `?role=${role}`);
    await expect(
      page.getByText("Profile settings are currently available for creator accounts."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit GitHub profile" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

const picture = {
  name: "profile.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  ),
};

test("choosing and discarding a picture only changes its local preview", async ({ page }) => {
  await openSettings(page);
  await page.getByLabel("Choose profile picture").setInputFiles(picture);
  await expect(page.getByAltText("New profile picture preview")).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
  await page
    .getByRole("region", { name: "Profile picture" })
    .getByRole("button", { name: "Discard changes" })
    .click();
  await expect(page.getByAltText("New profile picture preview")).toHaveCount(0);
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
});

test("saving a picture posts its signed fields before completion; completion retries reuse that upload", async ({
  page,
}) => {
  let postBody = "";
  await page.route("https://uploads.example.test/photo", async (route) => {
    expect(route.request().method()).toBe("POST");
    postBody = route.request().postDataBuffer()!.toString();
    await page.evaluate(() => window.settingsFixture.calls.push({ name: "s3:post", args: {} }));
    await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await openSettings(page);
  await page.getByLabel("Choose profile picture").setInputFiles(picture);
  await expect(page.getByAltText("New profile picture preview")).toBeVisible();
  await page.evaluate(() => window.settingsFixture.failNext("media:completeUpload"));
  await page.getByRole("button", { name: "Save picture", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn't confirm the save");
  await expect(page.getByAltText("New profile picture preview")).toBeVisible();
  expect(postBody).toContain('name="key"');
  expect(postBody).toContain("staging/test-photo");
  expect(postBody).toContain('name="policy"');
  expect(postBody).toContain('name="file"; filename="profile.png"');

  await page.getByRole("button", { name: "Save picture", exact: true }).click();
  await expect(page.getByText("Profile picture saved.", { exact: true })).toBeVisible();
  await expect(page.getByAltText("Your profile picture")).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls.map((call) => call.name))).toEqual([
    "media:requestUpload",
    "s3:post",
    "media:completeUpload",
    "media:completeUpload",
    "media:getProfilePicture",
  ]);
});

test("unsupported and unreadable pictures are rejected without contacting S3", async ({ page }) => {
  await openSettings(page);
  const fileInput = page.getByLabel("Choose profile picture");
  await fileInput.setInputFiles({
    name: "avatar.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a JPEG, PNG, or WebP image.");
  await fileInput.setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("This image couldn't be opened");
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
});

test("settings forms fit a narrow viewport and remain keyboard accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSettings(page);
  await page.getByRole("button", { name: "Edit GitHub profile" }).click();
  await expect(page.getByLabel("GitHub profile URL")).toBeFocused();
  await page.getByLabel("GitHub profile URL").fill("https://github.com/new-profile");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Discard GitHub changes" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel("Choose profile picture").setInputFiles(picture);
  await expect(page.getByAltText("New profile picture preview")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings-mobile.png"), fullPage: true });
});

test("profile and portfolio sections render together on desktop", async ({ page }, testInfo) => {
  await openSettings(page);
  await expect(page.getByRole("heading", { name: "Profile picture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings-desktop.png"), fullPage: true });
});

test("signed-out visitors to the actual Settings route land on log in", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
