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
      await route.fulfill({
        contentType: "application/javascript",
        body: bundle,
      });
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

test("saving basic details normalizes the username and preserves the portfolio", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit basic details" }).click();
  await page.getByLabel("Username", { exact: true }).fill("  ZahraTech  ");
  await page.getByLabel("Phone number (optional)").fill("  +1 617 555 0123  ");
  await page.getByRole("button", { name: "Save basic details" }).click();
  const details = page.getByRole("region", { name: "Basic details" });
  await expect(details.getByText("zahratech", { exact: true })).toBeVisible();
  await expect(details.getByText("+1 617 555 0123", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /https:\/\/github.com\/zahra/ })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: { username: "zahratech", phoneNumber: "+1 617 555 0123" },
    },
  ]);
});

test("basic details keep WorkOS names and email read-only", async ({ page }) => {
  await openSettings(page);
  const details = page.getByRole("region", { name: "Basic details" });
  await expect(details.getByText("Zahra", { exact: true })).toBeVisible();
  await expect(details.getByText("Wibisana", { exact: true })).toBeVisible();
  await expect(details.getByText("zahra@example.test", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Edit basic details" }).click();
  await expect(details.getByRole("textbox")).toHaveCount(2);
  await expect(details.getByLabel("Username", { exact: true })).toBeFocused();
  await expect(details.getByRole("button", { name: "Save basic details" })).toBeDisabled();
  await expect(details.getByText("zahra@example.test", { exact: true })).toBeVisible();
});

test("a taken username preserves both fields and allows a corrected retry", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit basic details" }).click();
  const username = page.getByLabel("Username", { exact: true });
  const phone = page.getByLabel("Phone number (optional)");
  await username.fill("taken-name");
  await phone.fill("+1 617 555 0123");
  await page.evaluate(() => window.settingsFixture.rejectUsername());
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(page.getByRole("alert")).toHaveText("That username is taken. Choose another.");
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toBeFocused();
  await expect(username).toHaveValue("taken-name");
  await expect(phone).toHaveValue("+1 617 555 0123");

  await username.fill("available-name");
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(page.getByText("Basic details saved.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: { username: "taken-name", phoneNumber: "+1 617 555 0123" },
    },
    {
      name: "creators:update",
      args: { username: "available-name", phoneNumber: "+1 617 555 0123" },
    },
  ]);
});

test("a failed basic details save keeps the draft available for retry", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit basic details" }).click();
  await page.getByLabel("Username", { exact: true }).fill("new-username");
  await page.getByLabel("Phone number (optional)").fill("+1 617 555 0123");
  await page.evaluate(() => window.settingsFixture.failNext("creators:update"));
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(page.getByRole("alert")).toContainText("Something went wrong");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("new-username");
  await expect(page.getByLabel("Phone number (optional)")).toHaveValue("+1 617 555 0123");
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(page.getByText("Basic details saved.", { exact: true })).toBeVisible();
});

test("an optional phone can be cleared without choosing an unset username", async ({ page }) => {
  await openSettings(page);
  await page.evaluate(() => window.settingsFixture.setProfile({ username: undefined }));
  await page.getByRole("button", { name: "Edit basic details" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
  await page.getByLabel("Phone number (optional)").fill("   ");
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(page.getByText("Basic details saved.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([
    { name: "creators:update", args: { phoneNumber: null } },
  ]);
  await page.getByRole("button", { name: "Edit basic details" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Phone number (optional)")).toHaveValue("");
});

test("an existing username cannot be cleared", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Edit basic details" }).click();
  const username = page.getByLabel("Username", { exact: true });
  await username.fill("   ");
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(page.getByRole("alert")).toContainText("An existing username cannot be cleared.");
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toBeFocused();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
});

test("discarding basic details uses the latest profile without overwriting an unsaved draft", async ({
  page,
}) => {
  await openSettings(page);
  const details = page.getByRole("region", { name: "Basic details" });
  await details.getByRole("button", { name: "Edit basic details" }).click();
  await page.getByLabel("Username", { exact: true }).fill("my-draft");
  await page.getByLabel("Phone number (optional)").fill("+1 617 555 0123");
  await page.evaluate(() =>
    window.settingsFixture.setProfile({
      username: "updated-elsewhere",
      phoneNumber: "+1 617 555 0199",
    }),
  );
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("my-draft");
  await expect(page.getByLabel("Phone number (optional)")).toHaveValue("+1 617 555 0123");
  await page.getByRole("button", { name: "Discard basic details changes" }).click();
  await expect(details.getByText("updated-elsewhere", { exact: true })).toBeVisible();
  await expect(details.getByText("+1 617 555 0199", { exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Edit basic details" })).toBeFocused();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
});

test("saving basic details only patches fields changed since editing began", async ({ page }) => {
  await openSettings(page);
  const details = page.getByRole("region", { name: "Basic details" });
  await details.getByRole("button", { name: "Edit basic details" }).click();
  await page.getByLabel("Phone number (optional)").fill("+1 617 555 0123");
  await page.evaluate(() => window.settingsFixture.setProfile({ username: "updated-elsewhere" }));
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(details.getByText("updated-elsewhere", { exact: true })).toBeVisible();

  await details.getByRole("button", { name: "Edit basic details" }).click();
  await page.getByLabel("Username", { exact: true }).fill("my-new-name");
  await page.evaluate(() => window.settingsFixture.setProfile({ phoneNumber: "+1 617 555 0199" }));
  await page.getByRole("button", { name: "Save basic details" }).click();
  await expect(details.getByText("+1 617 555 0199", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([
    { name: "creators:update", args: { phoneNumber: "+1 617 555 0123" } },
    { name: "creators:update", args: { username: "my-new-name" } },
  ]);
});

test("pending basic details saves disable editing and prevent duplicate submissions", async ({
  page,
}) => {
  await openSettings(page);
  const details = page.getByRole("region", { name: "Basic details" });
  await details.getByRole("button", { name: "Edit basic details" }).click();
  await page.getByLabel("Username", { exact: true }).fill("my-new-name");
  await page.evaluate(() => window.settingsFixture.delayNext("creators:update"));
  await details.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Phone number (optional)")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Discard basic details changes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Saving basic details/ })).toBeDisabled();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([
    { name: "creators:update", args: { username: "my-new-name" } },
  ]);
  await page.evaluate(() => window.settingsFixture.release("creators:update"));
  await expect(page.getByText("Basic details saved.", { exact: true })).toBeVisible();
  await expect(details.getByRole("button", { name: "Edit basic details" })).toBeFocused();
});

test("basic details fit on mobile with keyboard navigation and long identity fields", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSettings(page);
  await page.evaluate(() =>
    window.settingsFixture.setProfile({
      email: "a-long-email-address-for-a-creator-with-several-names@example.test",
    }),
  );
  await page.getByRole("button", { name: "Edit basic details" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Phone number (optional)")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Discard basic details changes" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("basic-details-mobile.png"),
    fullPage: true,
  });
});

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
    {
      name: "creators:update",
      args: { githubLink: "https://github.com/new-profile" },
    },
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
    await expect(page.getByRole("region", { name: "Basic details" })).toHaveCount(0);
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

// Profile picture uploads are off for now; re-enable with UPLOADS_ENABLED in profile-picture-section.tsx.
test.skip("choosing and discarding a picture only changes its local preview", async ({ page }) => {
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

// Profile picture uploads are off for now; re-enable with UPLOADS_ENABLED in profile-picture-section.tsx.
test.skip("saving a picture posts its signed fields before completion; completion retries reuse that upload", async ({
  page,
}) => {
  let postBody = "";
  await page.route("https://uploads.example.test/photo", async (route) => {
    expect(route.request().method()).toBe("POST");
    postBody = route.request().postDataBuffer()!.toString();
    await page.evaluate(() => window.settingsFixture.calls.push({ name: "s3:post", args: {} }));
    await route.fulfill({
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
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

test("picture uploads are marked as coming soon and cannot be chosen", async ({ page }) => {
  await openSettings(page);
  const section = page.getByRole("region", { name: "Profile picture" });
  await expect(section.getByText("Profile picture uploads are coming soon.")).toBeVisible();
  await expect(section.getByRole("button", { name: "Choose picture" })).toBeDisabled();
  await expect(page.getByLabel("Choose profile picture")).toBeDisabled();
});

// Profile picture uploads are off for now; re-enable with UPLOADS_ENABLED in profile-picture-section.tsx.
test.skip("unsupported and unreadable pictures are rejected without contacting S3", async ({
  page,
}) => {
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
  await page.screenshot({
    path: testInfo.outputPath("settings-mobile.png"),
    fullPage: true,
  });
});

test("profile and portfolio sections render together on desktop", async ({ page }, testInfo) => {
  await openSettings(page);
  await expect(page.getByRole("heading", { name: "Profile picture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("settings-desktop.png"),
    fullPage: true,
  });
});

test("signed-out visitors to the actual Settings route land on log in", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
