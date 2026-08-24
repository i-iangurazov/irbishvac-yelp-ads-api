import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: {
      email: "admin@yelp-console.local",
      password: "ChangeMe123!",
    },
  });

  expect(response.ok()).toBe(true);
}

async function gotoReady(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("create CPC flow", async ({ page }) => {
  await login(page);
  await gotoReady(page, "/programs/new");
  await page
    .getByRole("textbox", { name: "Daily budget (dollars)", exact: true })
    .fill("21.67");
  await page.getByRole("button", { name: "Submit program" }).click();
  await expect(page).toHaveURL(/\/programs\//);
});

test("current budget operation flow", async ({ page }) => {
  await login(page);
  await gotoReady(page, "/programs/demo-program-cpc");
  await page.getByLabel("New daily budget").fill("23.33");
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith("/api/programs/demo-program-cpc/budget") &&
        candidate.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Submit budget change" }).click(),
  ]);
  expect(
    response.ok(),
    `Budget API returned ${response.status()}: ${await response.text()}`,
  ).toBe(true);
  await expect(page).toHaveURL(/jobId=/);
});

test("terminate flow", async ({ page }) => {
  await login(page);
  await gotoReady(page, "/programs/demo-program-cpc");
  await page.getByRole("button", { name: "Terminate program" }).click();
  await page.getByRole("button", { name: "Send terminate request" }).click();
  await expect(page).toHaveURL(/jobId=/);
});

test("feature updates flow", async ({ page }) => {
  await login(page);
  await gotoReady(page, "/program-features/demo-program-cpc");
  const linkTracking = page
    .getByRole("heading", { name: "Link Tracking", exact: true })
    .locator("..")
    .locator("..");
  await linkTracking
    .locator('input[name="destinationUrl"]')
    .fill("https://northwindhvac.example/new-offer");
  await linkTracking.getByRole("button", { name: "Save feature" }).click();
  await expect(page.getByText("Link Tracking updated.")).toBeVisible();
});

test("report request and fetch flow", async ({ page }) => {
  await login(page);
  await gotoReady(page, "/reporting");
  await page.getByLabel("Start date").fill("2026-03-01");
  await page.getByLabel("End date").fill("2026-03-07");
  await page.getByRole("button", { name: "Request report" }).click();
  await expect(page).toHaveURL(/\/reporting\//);
});

test("permission boundary on settings", async ({ page }) => {
  await login(page);
  await gotoReady(page, "/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
});
