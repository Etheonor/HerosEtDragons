import { expect, test } from "@playwright/test";
import { KAELITH, login, seed } from "./helpers";

test.describe("Accueil", () => {
  test("le joueur voit sa feuille et l'ouvre d'un clic", async ({ page }) => {
    await seed(page.request, { reset: false });
    await login(page, KAELITH);
    await page.goto("/");

    await expect(page.getByText("Campagne de dev")).toBeVisible();
    await expect(page.getByText(/Vous êtes joueur/)).toBeVisible();

    await page.getByRole("button", { name: /Feuille · Kaelith/ }).click();
    await expect(page).toHaveURL(/\/characters\/pj-kaelith/);
    await expect(page.getByText("Feuille de personnage")).toBeVisible();
  });

  test("le double-clic sur la carte ouvre la table", async ({ page }) => {
    await seed(page.request);
    await login(page, KAELITH);
    await page.goto("/");

    await page.locator(".campaign-card", { hasText: "Campagne de dev" }).dblclick();
    await expect(page).toHaveURL(/\/campaigns\/dev-camp\/table/);
  });
});
