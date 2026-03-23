import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@yelp-console.local");
  await page.getByLabel("Password").fill("ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("create CPC flow", async ({ page }) => {
  await login(page);
  await page.goto("/programs/new");
  await page.getByLabel("Monthly budget (dollars)").fill("650.00");
  await page.getByLabel("Ad categories").fill("HVAC");
  await page.getByRole("button", { name: "Submit program" }).click();
  await expect(page).toHaveURL(/\/programs\//);
});

test("edit budget and bid flow", async ({ page }) => {
  await login(page);
  await page.goto("/programs/demo-program-cpc");
  await page.getByLabel("Monthly budget (dollars)").fill("700.00");
  await page.getByLabel("Max bid (dollars)").fill("25.00");
  await page.getByRole("button", { name: "Submit update" }).click();
  await expect(page).toHaveURL(/jobId=/);
});

test("terminate flow", async ({ page }) => {
  await login(page);
  await page.goto("/programs/demo-program-cpc");
  await page.getByRole("button", { name: "Terminate program" }).click();
  await page.getByRole("button", { name: "Confirm termination" }).click();
  await expect(page).toHaveURL(/jobId=/);
});

test("feature updates flow", async ({ page }) => {
  await login(page);
  await page.goto("/program-features/demo-program-cpc");
  await page.getByLabel("Destination URL").fill("https://northwindhvac.example/new-offer");
  await page.getByRole("button", { name: "Save feature" }).first().click();
  await expect(page.getByText("updated")).toBeVisible();
});

test("report request and fetch flow", async ({ page }) => {
  await login(page);
  await page.goto("/reporting");
  await page.getByLabel("Start date").fill("2026-03-01");
  await page.getByLabel("End date").fill("2026-03-07");
  await page.getByRole("button", { name: "Request report" }).click();
  await expect(page).toHaveURL(/\/reporting\//);
});

test("permission boundary on settings", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await expect(page.getByText("Admin settings")).toBeVisible();
});
