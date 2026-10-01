import { expect, test, type Page } from "@playwright/test";
import { CAMPAIGN, login, seed } from "./helpers";

/** Plafond de l'API : une requête ne rend jamais plus de 200 fiches. */
const PAGE_LIMIT = 200;

test.describe("Compendium", () => {
  test.beforeEach(async ({ page }) => {
    // Pas de purge du Durable Object : le compendium ne lit que du D1 seedé, et
    // le purge effacerait la table d'un test joueur dans un autre worker.
    await seed(page.request, { reset: false });
    await login(page, "mj");
    await page.goto(`/compendium?campaign=${CAMPAIGN}`);
  });

  /** Total de la catégorie, lu dans le RAIL (stable, indépendant de la requête
   *  en cours) et non dans le compteur de liste, qui affiche encore la
   *  catégorie précédente pendant le rechargement. */
  async function categoryTotal(page: Page, name: RegExp): Promise<number> {
    return Number(await page.getByRole("button", { name }).locator(".rail-count").innerText());
  }

  /** Le bouton « Afficher plus » change de libellé (« Chargement… ») pendant la
   *  requête : on le cible par sa classe, sinon le clic peut être perdu en plein
   *  re-rendu (flake historique du test de tri). */
  const moreBtn = (page: Page) => page.locator(".list-more .more-btn");

  /**
   * Charge TOUTE une catégorie, page par page, et attend la liste complète.
   *
   * Le piège qu'elle évite : boucler sur `await moreBtn.isVisible()` teste la
   * visibilité AVANT que la 1re page ne soit arrivée. Le bouton n'existe que si
   * `entries.length < total`, donc pendant le rechargement de catégorie il est
   * absent — la boucle ne s'exécute jamais, aucun clic n'est fait, et le test
   * échoue sur 200/361 en moins d'une seconde. D'où l'attente explicite de la
   * page 1 avant de boucler, puis une attente d'état sur le bouton.
   */
  async function loadAllPages(page: Page, total: number) {
    const list = page.locator(".list .row");
    await expect(list).toHaveCount(Math.min(PAGE_LIMIT, total));
    for (let pageNo = 1; pageNo < 20; pageNo++) {
      const plus = moreBtn(page);
      const gone = await plus
        .waitFor({ state: "detached", timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (gone) break;
      const avant = await list.count();
      if (avant >= total) break;
      await plus.click();
      await expect.poll(() => list.count(), { timeout: 10_000 }).toBeGreaterThan(avant);
    }
    await expect(list).toHaveCount(total);
  }

  test("toutes les fiches d'une catégorie sont atteignables, pas les 200 premières", async ({
    page,
  }) => {
    const grimoire = page.getByRole("button", { name: /Grimoire/ });
    const total = await categoryTotal(page, /Grimoire/);
    expect(total).toBeGreaterThan(200);

    await grimoire.click();
    const list = page.locator(".list .row");
    await expect(list).toHaveCount(PAGE_LIMIT);
    await expect(page.locator(".list-count")).toHaveText(`${PAGE_LIMIT} / ${total}`);
    await expect(moreBtn(page)).toBeVisible();

    const cible = Math.min(400, total);
    await moreBtn(page).click();
    await expect(list).toHaveCount(cible);

    const derniere = list.nth(cible - 1);
    await expect(derniere).toBeVisible();
    await derniere.click();
    await expect(page.locator(".entry-col")).not.toHaveText(/introuvable|Impossible/i);

    if (total > cible) {
      await moreBtn(page).click();
      await expect(list).toHaveCount(total);
    }
    await expect(moreBtn(page)).toHaveCount(0);
  });

  test("changer de catégorie repart de la première page", async ({ page }) => {
    const historiques = await categoryTotal(page, /Historiques/);
    const grimoire = await categoryTotal(page, /Grimoire/);

    await page.getByRole("button", { name: /Grimoire/ }).click();
    await loadAllPages(page, grimoire);

    await page.getByRole("button", { name: /Historiques/ }).click();
    await expect(page.locator(".list .row")).toHaveCount(historiques);
    await expect(page.locator(".list-count")).toHaveCount(0);
  });

  test("un titre accenté est à son rang alphabétique, pas à la fin", async ({ page }) => {
    const total = await categoryTotal(page, /Grimoire/);
    await page.getByRole("button", { name: /Grimoire/ }).click();
    const list = page.locator(".list .row");

    await loadAllPages(page, total);

    await expect(list.filter({ hasText: "Éclat de bois" })).toHaveCount(1);
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
