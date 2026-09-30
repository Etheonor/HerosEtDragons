import { expect, test, type Page } from "@playwright/test";
import { CAMPAIGN, login, seed } from "./helpers";

/** Le compendium est paginé côté client (plafond API : 200 par requête).
 *  Régression : la liste s'arrêtait à la 200ᵉ fiche — le grimoire (361 entrées)
 *  s'affichait donc jusqu'à « Lumière du jour », et rien au-delà. */
test.describe("Compendium", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page.request);
    await login(page, "mj");
    await page.goto(`/compendium?campaign=${CAMPAIGN}`);
  });

  /** Total de la catégorie, lu dans le RAIL (stable, indépendant de la requête
   *  en cours) et non dans le compteur de liste, qui affiche encore la
   *  catégorie précédente pendant le rechargement. */
  async function categoryTotal(page: Page, name: RegExp): Promise<number> {
    return Number(await page.getByRole("button", { name }).locator(".rail-count").innerText());
  }

  test("toutes les fiches d'une catégorie sont atteignables, pas les 200 premières", async ({
    page,
  }) => {
    const grimoire = page.getByRole("button", { name: /Grimoire/ });
    const total = await categoryTotal(page, /Grimoire/);
    expect(total).toBeGreaterThan(200);

    await grimoire.click();
    const list = page.locator(".list .row");
    // Une seule page n'est pas tout : le compteur et le bouton le signalent.
    await expect(list).toHaveCount(200);
    await expect(page.locator(".list-count")).toHaveText(`200 / ${total}`);
    await expect(page.getByRole("button", { name: /^Afficher plus/ })).toBeVisible();

    // Au clic, la 2ᵉ page s'ajoute (ou le reste si la catégorie est plus petite).
    const cible = Math.min(400, total);
    await page.getByRole("button", { name: /^Afficher plus/ }).click();
    await expect(list).toHaveCount(cible);

    // La dernière fiche de la 2ᵉ page est atteignable et s'ouvre — c'est
    // exactement la plage qui était invisible avant le correctif.
    const derniere = list.nth(cible - 1);
    await expect(derniere).toBeVisible();
    await derniere.click();
    await expect(page.locator(".entry-col")).not.toHaveText(/introuvable|Impossible/i);

    // Le bouton ne reste que s'il reste une page ; une fois tout chargé il
    // disparaît (sinon l'utilisateur croit qu'il reste des fiches).
    if (total > cible) {
      await page.getByRole("button", { name: /^Afficher plus/ }).click();
      await expect(list).toHaveCount(total);
    }
    await expect(page.getByRole("button", { name: /^Afficher plus/ })).toHaveCount(0);
  });

  test("changer de catégorie repart de la première page", async ({ page }) => {
    const historiques = await categoryTotal(page, /Historiques/);

    await page.getByRole("button", { name: /Grimoire/ }).click();
    await page.getByRole("button", { name: /^Afficher plus/ }).click();
    await expect(page.locator(".list .row")).toHaveCount(361);

    // Une autre catégorie repart à zéro : pas de mélange des deux listes.
    await page.getByRole("button", { name: /Historiques/ }).click();
    await expect(page.locator(".list .row")).toHaveCount(historiques);
    await expect(page.locator(".list-count")).toHaveCount(0);
  });

  test("un titre accenté est à son rang alphabétique, pas à la fin", async ({ page }) => {
    // Régression : SQLite ordonne par OCTETS, donc « É » (0xC3 0x89, après Z)
    // plaçait « Éclat de bois » en 354ᵉ sur 361 — invisible, et introuvable
    // pour l'utilisateur qui le cherchait vers les E.
    const total = await categoryTotal(page, /Grimoire/);
    await page.getByRole("button", { name: /Grimoire/ }).click();
    const list = page.locator(".list .row");

    // On charge TOUTE la catégorie avant de juger le tri : le compteur de liste
    // affiche encore la catégorie précédente pendant le rechargement, et un
    // `count()` lu trop tôt rendait ce test instable (flake préexistant).
    const plus = page.getByRole("button", { name: /^Afficher plus/ });
    while (await plus.isVisible().catch(() => false)) {
      const avant = await list.count();
      await plus.click();
      await expect.poll(() => list.count()).toBeGreaterThan(avant);
    }
    await expect(list).toHaveCount(total);

    await expect(list.filter({ hasText: "Éclat de bois" })).toHaveCount(1);
    // La liste se termine bien par un titre au-delà de « Z » : plus aucun tas
    // de titres accentués collés après « Z ».
    const dernier = await list
      .nth(total - 1)
      .locator(".row-title")
      .innerText();
    expect(dernier.localeCompare("Z", "fr")).toBeGreaterThanOrEqual(0);
  });

  test("la recherche ignore accents et ligatures", async ({ page }) => {
    await page.getByPlaceholder(/rechercher/i).fill("aigle geant");
    await expect(page.locator(".list .row").filter({ hasText: "Aigle géant" })).toHaveCount(1);

    await page.getByPlaceholder(/rechercher/i).fill("mauvais œil");
    await expect(page.locator(".list .row").filter({ hasText: "Mauvais œil" })).toHaveCount(1);
  });
});
