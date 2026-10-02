import { expect, test } from "@playwright/test";
import { CAMPAIGN, KAELITH, MAP_IMAGE, MJ, RAGNAR, login, openTable, seed } from "./helpers";

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

  test("le MJ voit la barre d'outils complète, un joueur n'a que la Main", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);
    await expect(page.getByRole("button", { name: "Déplacer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cartes" })).toBeVisible();

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await openTable(p2, KAELITH);
    await expect(p2.getByRole("button", { name: "Déplacer" })).toHaveCount(0);
    await expect(p2.getByRole("button", { name: "Main" }).first()).toBeVisible();
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

test.describe("Chrome : palette et aide (Lot 2)", () => {
  test("Espace ouvre la palette, « grille 48 » règle la taille sur la carte", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    await page.keyboard.press("Space");
    const input = page.getByPlaceholder(/Rechercher une action/);
    await expect(input).toBeVisible();
    await input.fill("grille 48");
    await page.getByRole("option", { name: /Grille : 48 px/ }).click();
    await expect(input).toHaveCount(0);

    // Le réglage est RENDU sur la carte, pas seulement stocké.
    await expect(page.locator(".map-grid--overlay")).toBeVisible();
    const size = await page
      .locator(".map-grid--overlay")
      .evaluate((el) => getComputedStyle(el).backgroundSize);
    expect(size).toContain("48px");
  });

  test("? ouvre l'aide clavier générée depuis la table, Échap la ferme", async ({ page }) => {
    await openTable(page, MJ);
    await page.keyboard.press("?");
    await expect(page.locator(".help-title")).toBeVisible();
    // L'aide est bien générée depuis la table (le raccourci d'ouverture y figure).
    await expect(page.locator(".help-row kbd", { hasText: "?" })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".help-title")).toHaveCount(0);
  });
});

test.describe("Panneaux flottants (Lot 1)", () => {
  test("ils se ferment, persistent au rechargement, et se rouvrent", async ({ page }) => {
    await openTable(page, MJ);
    await expect(page.locator(".compagnie")).toBeVisible();
    await expect(page.locator(".panel")).toBeVisible();

    await page.getByRole("button", { name: "Fermer la compagnie" }).click();
    await expect(page.locator(".compagnie")).toHaveCount(0);
    await expect(page.locator(".panel")).toBeVisible();

    // L'état survit au rechargement (localStorage, par navigateur).
    await page.reload();
    await expect(page.locator(".compagnie")).toHaveCount(0);
    await expect(page.locator(".panel")).toBeVisible();

    // Le taquet latéral la rouvre.
    await page.getByRole("button", { name: "Afficher la compagnie" }).click();
    await expect(page.locator(".compagnie")).toBeVisible();
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

  test("le MJ choisit la couleur du quadrillage, et elle est réellement rendue", async ({
    page,
  }) => {
    // Remise à zéro en API : ce test pose une teinte, on ne laisse pas de
    // couleur derrière lui pour le run suivant (l'UI ne réinitialise pas).
    const setGridColor = (color: string) =>
      page.request.patch(`/api/maps/${MAP_IMAGE}`, { multipart: { gridColor: color } });
    await setGridColor("");

    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    const grid = page.locator(".map-grid--overlay");
    await expect(grid).toBeVisible();
    // Par défaut : couleur du thème, donc pas de rendu en teinte.
    await expect(grid).not.toHaveClass(/map-grid--tinted/);

    await page.getByRole("button", { name: "Cartes" }).click();
    await page
      .locator(".row-wrap", { hasText: "Carte illustrée" })
      .getByTitle(/Grille/)
      .click();

    // Le color picker est désactivé tant qu'on est sur « Thème » ; le bouton
    // bascule (son libellé change, on le cible donc par position).
    const swatch = page.locator(".grid-color");
    await expect(swatch).toBeDisabled();
    await page.locator(".grid-color-row button").click();
    await expect(swatch).toBeEnabled();
    await swatch.fill("#ff0000");
    await page.getByRole("button", { name: "Appliquer" }).click();

    // La couleur est RENDUE, pas seulement stockée : la classe active le rendu
    // en teinte et la variable CSS est calculée.
    await page.getByRole("button", { name: "Cartes" }).click();
    await expect(grid).toHaveClass(/map-grid--tinted/);
    const line = await grid.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--map-grid-line"),
    );
    expect(line).not.toBe("");

    // Retour à la couleur du thème : le rendu d'origine revient.
    await setGridColor("");
    await page.reload();
    await expect(page.locator(".map-grid--overlay")).not.toHaveClass(/map-grid--tinted/);
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

  test("l'outil Main déplace réellement la carte (quand elle déborde)", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();
    await page.getByRole("button", { name: "Main" }).click();

    const frame = (await page.locator(".map-frame").boundingBox())!;
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;

    // À 100 %, la carte tient dans le cadre plein écran : `clampView` la centre
    // et le panoramique est verrouillé (comportement voulu). On zoome donc
    // d'abord pour créer un débordement — c'est la condition du panoramique.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -600);
    await expect(page.locator(".hud-fit")).not.toHaveText("100%");

    const before = (await page.locator(".map-surface").boundingBox())!;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 80, { steps: 12 });
    await page.mouse.up();

    const after = (await page.locator(".map-surface").boundingBox())!;
    // La carte a bougé à l'écran, sans revenir à 100 %.
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(40);
    await expect(page.locator(".hud-fit")).not.toHaveText("100%");
  });

  test("un JOUEUR déplace la carte : clic droit, ou le bouton du HUD", async ({
    page,
    browser,
  }) => {
    // Le MJ choisit la carte (le panneau Cartes lui est réservé).
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    // Le joueur rejoint SANS re-seeder : sinon le reset purgerait la carte
    // active que le MJ vient de choisir.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.getByRole("button", { name: "Journal" })).toBeVisible();
    await expect(p2.locator(".map-surface")).toBeVisible();

    // 1. Le bouton « Main » du HUD existe pour un joueur (il n'y a pas de
    //    barre d'outils MJ pour lui) : c'est le reproche initial.
    const hand = p2.locator(".hud-hand");
    await expect(hand).toBeVisible();

    // 2. Clic droit glissé = panoramique, sans passer par l'outil Main. Il faut
    //    zoomer d'abord : à 100 % la carte plein écran est centrée et verrouillée.
    const frame = (await p2.locator(".map-frame").boundingBox())!;
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;
    await p2.mouse.move(cx, cy);
    await p2.mouse.wheel(0, -600);
    await expect(p2.locator(".hud-fit")).not.toHaveText("100%");

    const before = (await p2.locator(".map-surface").boundingBox())!;
    await p2.mouse.move(cx, cy);
    await p2.mouse.down({ button: "right" });
    await p2.mouse.move(cx + 130, cy + 90, { steps: 12 });
    await p2.mouse.up({ button: "right" });
    const afterRight = (await p2.locator(".map-surface").boundingBox())!;
    expect(Math.abs(afterRight.x - before.x)).toBeGreaterThan(40);

    // 3. Le bouton du HUD bascule le panoramique au clic gauche (et se désactive).
    await expect(hand).toHaveAttribute("aria-pressed", "false");
    await hand.click();
    await expect(hand).toHaveAttribute("aria-pressed", "true");
    const beforeLeft = (await p2.locator(".map-surface").boundingBox())!;
    await p2.mouse.move(cx, cy);
    await p2.mouse.down();
    await p2.mouse.move(cx - 110, cy - 70, { steps: 12 });
    await p2.mouse.up();
    const afterLeft = (await p2.locator(".map-surface").boundingBox())!;
    expect(Math.abs(afterLeft.x - beforeLeft.x)).toBeGreaterThan(40);
    await hand.click();
    await expect(hand).toHaveAttribute("aria-pressed", "false");

    await ctx.close();
  });
});

test.describe("Pions vivants (Lot 3)", () => {
  test("le MJ place un PNJ : barre de PV pour lui, absente pour le joueur", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    await page
      .locator(".pnj-card", { hasText: "Gobelin" })
      .getByRole("button", { name: "Placer sur la carte" })
      .click();

    const mjToken = page.locator(".token", { hasText: "Gobelin" });
    await expect(mjToken).toBeVisible();
    await expect(mjToken.locator(".token-hp")).toHaveCount(1);

    // Le joueur voit le pion (le brouillard n'est pas actif) mais jamais ses PV :
    // pnjPvVisible=false par défaut, le serveur envoie pv=null.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.getByRole("button", { name: "Journal" })).toBeVisible();

    const plToken = p2.locator(".token", { hasText: "Gobelin" });
    await expect(plToken).toBeVisible();
    await expect(plToken.locator(".token-hp")).toHaveCount(0);

    await ctx.close();
  });

  test("la plaque de nom n'apparaît qu'au survol du pion", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();
    await page
      .locator(".pj-card", { hasText: "Kaelith" })
      .getByRole("button", { name: "Placer sur la carte" })
      .click();

    const token = page.locator(".token", { hasText: "Kaelith" });
    const label = token.locator(".token-label");
    await expect(label).toHaveCSS("opacity", "0");
    await token.hover();
    await expect(label).toHaveCSS("opacity", "1");
  });

  test("l'initiative recadre : sans effet à 100 %, centrage une fois zoomé", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();
    await page
      .locator(".pj-card", { hasText: "Kaelith" })
      .getByRole("button", { name: "Placer sur la carte" })
      .click();
    await page
      .locator(".pnj-card", { hasText: "Gobelin" })
      .getByRole("button", { name: "Placer sur la carte" })
      .click();
    await page.locator(".mode-btn", { hasText: "Combat" }).click();

    // Lance l'initiative de chaque PJ en attente.
    for (let round = 0; round < 3; round += 1) {
      const btns = page.locator(".roll-init-btn:not([disabled])");
      const n = await btns.count();
      for (let i = 0; i < n; i += 1) {
        await btns.nth(0).click();
        await page.waitForTimeout(120);
      }
    }
    const chips = page.locator(".init-chip");
    await expect(chips.first()).toBeVisible();

    // La carte tient entièrement dans le cadre : cliquer ne doit RIEN changer.
    const before = (await page.locator(".map-surface").boundingBox())!;
    await chips.first().click();
    await page.waitForTimeout(700);
    const after = (await page.locator(".map-surface").boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);

    // Zoomée : le pion du chip vient au centre du cadre (animation 400 ms).
    const chipText = (await chips.first().textContent()) ?? "";
    const name = chipText.split("·").pop()!.trim();
    const token = page.locator(".token", { hasText: name });
    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(200);
    await chips.first().click();
    await expect
      .poll(async () => {
        const b = (await token.boundingBox())!;
        return Math.hypot(
          b.x + b.width / 2 - (frame.x + frame.width / 2),
          b.y + b.height / 2 - (frame.y + frame.height / 2),
        );
      })
      .toBeLessThan(24);
  });

  test("la taille du pion suit la grille : 2 cases = 2 × gridSize pour tous", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Cartes" }).click();
    await page.getByRole("button", { name: /Carte illustrée/ }).click();

    const card = page.locator(".pj-card", { hasText: "Kaelith" });
    await card.getByRole("button", { name: "Placer sur la carte" }).click();
    const token = page.locator(".token", { hasText: "Kaelith" });
    await expect(token).toBeVisible();
    // Grille du seed : 32 px ; échelle par défaut : 1 case.
    await expect.poll(async () => Math.round((await token.boundingBox())!.width)).toBe(32);

    // Un joueur suit le changement (le réglage est diffusé, pas local).
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.getByRole("button", { name: "Journal" })).toBeVisible();
    const plToken = p2.locator(".token", { hasText: "Kaelith" });

    await card.locator(".size-select").selectOption("2");
    await expect.poll(async () => Math.round((await token.boundingBox())!.width)).toBe(64);
    await expect.poll(async () => Math.round((await plToken.boundingBox())!.width)).toBe(64);

    await ctx.close();
  });
});
