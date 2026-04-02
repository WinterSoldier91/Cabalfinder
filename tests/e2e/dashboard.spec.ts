import { test, expect } from "@playwright/test";

const TEST_MINT = "2odHeumkiJx46YyNHeZvDjMwsoNhpAgFQuipT96npump";

test.describe("Cabalfinder Dashboard", () => {
  test("should load and display system status", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("CABALFINDER SIGNAL DESK");
    
    // Status panel should load provider readiness
    const providerList = page.locator(".provider-list");
    await expect(providerList).toBeVisible();
    await expect(providerList).toContainText("Helius DAS + RPC");
  });

  test("should run a successful token scan", async ({ page }) => {
    await page.goto("/");
    
    const mintInput = page.locator("#mint");
    await mintInput.fill(TEST_MINT);
    
    const scanButton = page.getByRole("button", { name: /Run Helius Scan/i });
    await scanButton.click();
    
    // Wait for results grid (this can be slow)
    const resultsGrid = page.locator(".results-grid");
    await expect(resultsGrid).toBeVisible({ timeout: 60000 });
    
    // Check for at least one result card
    const firstCard = resultsGrid.locator(".result-card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText("Market cap");
    
    // Test Copy Table Action
    const copyAllBtn = page.getByRole("button", { name: /Copy all CAs/i });
    await expect(copyAllBtn).toBeVisible();
  });

  test("should handle invalid mint input", async ({ page }) => {
    await page.goto("/");
    
    const mintInput = page.locator("#mint");
    await mintInput.fill("this-is-not-a-mint");
    
    const scanButton = page.getByRole("button", { name: /Run Helius Scan/i });
    await scanButton.click();
    
    const errorBanner = page.locator(".error-banner");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/mint must be a valid/i);
  });
});
