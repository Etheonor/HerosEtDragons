import { expect, test } from "@playwright/test";
import { CAMPAIGN, KAELITH, MJ, RAGNAR, openTable, seed } from "./helpers";

test.describe("Connexion et table", () => {
  test("sans cookie de dev, le bypass est inerte (API 401, table vide)", async ({ page }) => {
    await seed(page.request);
    await page.context().clearCookies();

    // La propriété qui compte : l'API refuse.
    const api = await page.request.get("/api/campaigns");
    expect(api.status()).toBe(401);

    await page.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(page.getByText("Aucun personnage joueur")).toBeVisible();
    await expect(page.getByText("Le MJ n'a pas encore choisi de carte.")).toBeVisible();
  });

  test("un joueur arrive sur la table et voit sa compagnie", async ({ page }) => {
    await openTable(page, KAELITH);
    await expect(page.getByText("Campagne de dev")).toBeVisible();
    // Les deux PJ sont dans la colonne de gauche, le sien en particulier.
    await expect(page.locator(".compagnie")).toContainText("Kaelith");
    await expect(page.locator(".compagnie")).toContainText("Ragnar");
  });

  test("le MJ voit la barre d'outils, un joueur non", async ({ page, browser }) => {
    await openTable(page, MJ);
    await expect(page.getByText("Outils du MJ")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cartes" })).toBeVisible();

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await openTable(p2, KAELITH);
    await expect(p2.getByText("Outils du MJ")).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("Inventaire (R9)", () => {
  test("le sac du seed est visible : bourse et objets", async ({ page }) => {
    await openTable(page, KAELITH);
    await page.getByRole("button", { name: "Inventaire" }).click();

    // Bourse du seed : 12 po, 3 pa, 0 pc.
    await expect(page.locator(".coin.po")).toHaveText("12po");
    await expect(page.locator(".coin.pa")).toHaveText("3pa");
    await expect(page.locator(".coin.pc")).toHaveText("0pc");
    await expect(page.locator(".inv-name")).toContainText("Potion de soin");
    await expect(page.locator(".inv-qty")).toHaveText("×2");
  });

  test("le joueur peut jeter un objet, et le mouvement est journalisé", async ({ page }) => {
    await openTable(page, KAELITH);
    await page.getByRole("button", { name: "Inventaire" }).click();
    await expect(page.locator(".inv-name")).toContainText("Potion de soin");

    await page.getByTitle("Jeter Potion de soin").click();

    // Le sac est mis à jour sans rechargement : le badge de quantité disparaît
    // quand il ne reste qu'un exemplaire (le « ×1 » serait du bruit).
    await expect(page.locator(".inv-qty")).toHaveCount(0);
    // …et le journal trace le mouvement.
    await page.getByRole("button", { name: "Journal" }).click();
    await expect(page.locator(".journal-system").last()).toContainText("jette Potion de soin");
  });

  test("le MJ peut ajouter un objet ; un joueur n'a pas le champ", async ({ page, browser }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Inventaire" }).click();
    await page.locator(".inv-add input").first().fill("Élan");
    await page.getByRole("button", { name: "Ajouter" }).click();
    // Le sac contient désormais deux objets : on cible le nouveau par son texte.
    await expect(page.locator(".inv-name", { hasText: "Élan" })).toHaveCount(1);

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await openTable(p2, KAELITH);
    await p2.getByRole("button", { name: "Inventaire" }).click();
    await expect(p2.locator(".inv-add")).toHaveCount(0);
    await ctx.close();
  });

  test("un joueur est verrouillé sur son propre sac (R9.1)", async ({ page }) => {
    await openTable(page, RAGNAR);
    await page.getByRole("button", { name: "Inventaire" }).click();
    // Pas de sélecteur de sac pour un joueur, et son sac est vide.
    await expect(page.locator(".inv-selector")).toHaveCount(0);
    await expect(page.locator(".coin.po")).toHaveText("0po");
  });

  test("le sac d'un autre joueur n'est pas exposé dans le store", async ({ page }) => {
    await openTable(page, RAGNAR);
    // Le sac de Kaelith est seedé (12 po) : Ragnar ne doit pas le voir.
    const leaked = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("12po");
    });
    expect(leaked).toBe(false);
  });
});

test.describe("Carte : import d'image", () => {
  test("le MJ importe une image et la carte devient jouable", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();

    // Le panneau d'import utilise un <input type=file> caché.
    await page.setInputFiles('input[type=file][accept*="image/png"]', {
      name: "donjon.png",
      mimeType: "image/png",
      // PNG 2x2 valide, encodé en base64.
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVQI12NkYPjPgAcw4ZMcVQAAAOJ9Wl2nJwAAAAAElFTkSuQmCC",
        "base64",
      ),
    });

    // La carte importée devient active et son image est servie par l'API.
    const thumb = page.locator(".thumb").first();
    await expect(thumb).toHaveAttribute("src", /\/api\/maps\/.+\/image/);
    // …et elle est affichée sur la table.
    await expect(page.locator(".map-img")).toBeVisible();
  });

  test("un fichier qui n'est pas une image est refusé sans casser le panneau", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();

    await page.setInputFiles('input[type=file][accept*="image/png"]', {
      name: "pas-une-image.png",
      mimeType: "image/png",
      buffer: Buffer.from("ceci n'est pas un PNG"),
    });

    // Le panneau affiche l'erreur et la liste des cartes survit.
    await expect(page.locator(".panel-error")).toBeVisible();
    await expect(page.getByRole("button", { name: /Carte illustrée/ })).toBeVisible();
  });
});

test.describe("Carte : grille et vue", () => {
  test("le quadrillage réglable par le MJ apparaît sur la carte", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    const grid = page.locator(".map-grid--overlay");
    await expect(grid).toBeVisible();
    const size = await grid.evaluate((el) => getComputedStyle(el).backgroundSize);
    expect(size).toContain("32px");
  });

  test("le MJ peut retirer le quadrillage depuis le panneau Cartes", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();
    await expect(page.locator(".map-grid--overlay")).toBeVisible();

    // Ouvrir l'éditeur de grille (bouton ▦) puis retirer.
    await page.getByRole("button", { name: "Cartes" }).click();
    const row = page.locator(".row-wrap", { hasText: "Carte illustrée" });
    await row.getByTitle(/Grille/).click();
    await page.getByRole("button", { name: "Retirer" }).click();

    // Le panneau se referme tout seul : le quadrillage disparaît de la carte.
    await expect(page.locator(".map-grid--overlay")).toHaveCount(0);
  });

  test("la molette zoome, le bouton du HUD reset à 100 %", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, -600);

    await expect(page.locator(".hud-fit")).not.toHaveText("100%");
    await page.locator(".hud-fit").click();
    await expect(page.locator(".hud-fit")).toHaveText("100%");
  });

  test("l'outil Main déplace réellement la carte", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();
    await page.getByRole("button", { name: "Main" }).click();

    const before = (await page.locator(".map-surface").boundingBox())!;
    const frame = (await page.locator(".map-frame").boundingBox())!;

    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.down();
    await page.mouse.move(frame.x + frame.width / 2 + 120, frame.y + frame.height / 2 + 80, {
      steps: 12,
    });
    await page.mouse.up();

    const after = (await page.locator(".map-surface").boundingBox())!;
    // La carte a bougé à l'écran, et le zoom est resté à 100 %.
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(40);
    await expect(page.locator(".hud-fit")).toHaveText("100%");
  });
});
