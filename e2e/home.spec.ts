import { expect, test } from "@playwright/test";
import { KAELITH, MJ, login, seed } from "./helpers";

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

  test("le focus reste piégé dans la modale de création, et revient au bouton", async ({
    page,
  }) => {
    await seed(page.request, { reset: false });
    await login(page, MJ);
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "+ PJ" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Créer un personnage" });
    await expect(dialog).toBeVisible();

    // Tab ne doit jamais sortir de la modale.
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') !== null,
      );
      expect(inside, `Tab n°${i + 1}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Le focus est rendu au déclencheur (retour de focus).
    const restored = await page.evaluate(
      () => document.activeElement?.textContent?.includes("+ PJ") ?? false,
    );
    expect(restored).toBe(true);
  });

  test("le double-clic sur la carte ouvre la table", async ({ page }) => {
    await seed(page.request);
    await login(page, KAELITH);
    await page.goto("/");

    await page.locator(".campaign-card", { hasText: "Campagne de dev" }).dblclick();
    await expect(page).toHaveURL(/\/campaigns\/dev-camp\/table/);
  });
});
