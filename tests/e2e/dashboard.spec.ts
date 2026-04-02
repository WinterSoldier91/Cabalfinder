import { test, expect } from "@playwright/test";

const TEST_MINT = "2odHeumkiJx46YyNHeZvDjMwsoNhpAgFQuipT96npump";

test.describe("Cabalfinder Dashboard", () => {
  test("loads scanner shell", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /holder overlap scanner/i })).toBeVisible();
    await expect(page.getByLabel(/token mint/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /run scan/i })).toBeVisible();
  });

  test("runs a token scan", async ({ page }) => {
    await page.goto("/");

    await page.locator("#mint").fill(TEST_MINT);
    await page.getByRole("button", { name: /run scan/i }).click();

    const resultsGrid = page.locator(".results-grid");
    await expect(resultsGrid).toBeVisible({ timeout: 60_000 });

    const firstCard = resultsGrid.locator(".result-card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText(/market cap/i);

    await expect(page.getByRole("button", { name: /copy all cas/i })).toBeVisible();
  });

  test("shows validation error for invalid mint", async ({ page }) => {
    await page.goto("/");

    await page.locator("#mint").fill("this-is-not-a-mint");
    await page.getByRole("button", { name: /run scan/i }).click();

    const errorBanner = page.locator(".error-banner");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/mint/i);
  });
});
