import { expect, test } from "@playwright/test";
import {
  CAMPAIGN,
  KAELITH,
  MAP_IMAGE,
  MJ,
  RAGNAR,
  login,
  openPanel,
  openTable,
  placeFromLibrary,
  placePjFromFrame,
  seed,
  selectMap,
} from "./helpers";

test.describe("Connexion et table", () => {
  test("sans cookie de dev, le bypass est inerte (API 401, table vide)", async ({ page }) => {
    await seed(page.request);
    await page.context().clearCookies();

    // La propriété qui compte : l'API refuse.
    const api = await page.request.get("/api/campaigns");
    expect(api.status()).toBe(401);

    await page.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(page.getByText("Le MJ n'a pas encore choisi de carte.")).toBeVisible();
    // Sans personnage, le GroupFrame ne rend rien du tout.
    await expect(page.locator(".group-rail")).toHaveCount(0);
  });

  test("un joueur arrive sur la table et voit sa compagnie", async ({ page }) => {
    await openTable(page, KAELITH);
    await expect(page.locator(".mode-toggle")).toBeVisible();

    // Garde-fou : les commentaires de doc des composants ne doivent jamais être
    // rendus (en Svelte, du texte avant <script> devient du contenu affiché).
    const leaked = await page.evaluate(() =>
      /Asset manager|Shell de panneau|Menu contextuel unique|Tableau de bord MJ/.test(
        document.body.innerText,
      ),
    );
    expect(leaked).toBe(false);
    // Les deux PJ sont dans la colonne de gauche (GroupFrame), le sien en particulier.
    await expect(page.locator(".group-rail")).toContainText("Kaelith");
    await expect(page.locator(".group-rail")).toContainText("Ragnar");
  });

  test("le MJ voit la barre d'outils complète, un joueur n'a que la Main", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);
    await expect(page.getByRole("button", { name: "Déplacer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bibliothèque" })).toBeVisible();

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
    await openPanel(page, "inventory");

    // Bourse du seed : 12 po, 3 pa, 0 pc.
    await expect(page.locator(".coin.po .coin-value")).toHaveText("12 po");
    await expect(page.locator(".coin.pa .coin-value")).toHaveText("3 pa");
    await expect(page.locator(".coin.pc .coin-value")).toHaveText("0 pc");
    await expect(page.locator(".inv-name")).toContainText("Potion de soin");
    await expect(page.locator(".inv-qty")).toHaveText("×2");
  });

  test("le joueur peut jeter un objet, et le mouvement est journalisé", async ({ page }) => {
    await openTable(page, KAELITH);
    await openPanel(page, "inventory");
    await expect(page.locator(".inv-name")).toContainText("Potion de soin");

    await page.getByTitle("Jeter Potion de soin").click();

    // Le sac est mis à jour sans rechargement : le badge de quantité disparaît
    // quand il ne reste qu'un exemplaire (le « ×1 » serait du bruit).
    await expect(page.locator(".inv-qty")).toHaveCount(0);
    // …et le journal (toujours ouvert) trace le mouvement.
    await expect(page.locator(".journal-system").last()).toContainText("jette Potion de soin");
  });

  test("le MJ peut ajouter un objet ; un joueur n'a pas le champ", async ({ page, browser }) => {
    await openTable(page, MJ);
    await openPanel(page, "inventory");
    await page.locator(".inv-add input").first().fill("Élan");
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    // Le sac contient désormais deux objets : on cible le nouveau par son texte.
    await expect(page.locator(".inv-name", { hasText: "Élan" })).toHaveCount(1);

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await openTable(p2, KAELITH);
    await openPanel(p2, "inventory");
    await expect(p2.locator(".inv-add")).toHaveCount(0);
    await ctx.close();
  });

  test("l'argent s'ajuste par − / + sur chaque pièce (MJ sur le sac choisi, joueur sur le sien)", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);
    await openPanel(page, "inventory");

    // MJ : ±1 po sur le sac de Kaelith (12 → 13 → 12).
    await page.getByRole("button", { name: /Ajouter 1 pièce d'or/ }).click();
    await expect(page.locator(".coin.po .coin-value")).toHaveText("13 po");
    await page.getByRole("button", { name: /Retirer 1 pièce d'or/ }).click();
    await expect(page.locator(".coin.po .coin-value")).toHaveText("12 po");

    // Maj+clic = ±10 d'un coup.
    await page
      .getByRole("button", { name: /Ajouter 1 pièce d'or/ })
      .click({ modifiers: ["Shift"] });
    await expect(page.locator(".coin.po .coin-value")).toHaveText("22 po");

    // Le joueur ajuste SON sac (Ragnar est vide), sans sélecteur de sac.
    // On ne re-seede PAS : le reset purgerait le DO et l'ajout du MJ avec.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, RAGNAR);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.locator(".journal-panel")).toBeVisible();
    await openPanel(p2, "inventory");
    await expect(p2.locator(".inv-selector")).toHaveCount(0);
    await p2.getByRole("button", { name: /Ajouter 1 pièce d'or/ }).click();
    await expect(p2.locator(".coin.po .coin-value")).toHaveText("1 po");
    await ctx.close();
  });

  test("un joueur est verrouillé sur son propre sac (R9.1)", async ({ page }) => {
    await openTable(page, RAGNAR);
    await openPanel(page, "inventory");
    // Pas de sélecteur de sac pour un joueur, et son sac est vide.
    await expect(page.locator(".inv-selector")).toHaveCount(0);
    await expect(page.locator(".coin.po .coin-value")).toHaveText("0 po");
  });

  test("le sac d'un autre joueur n'est pas exposé dans le store", async ({ page }) => {
    await openTable(page, RAGNAR);
    // Le sac de Kaelith est seedé (12 po) : Ragnar ne doit pas le voir.
    const leaked = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes("12 po");
    });
    expect(leaked).toBe(false);
  });
});

test.describe("Chrome : palette et aide (Lot 2)", () => {
  test("Espace ouvre la palette, « grille 48 » règle la taille sur la carte", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    await page.keyboard.press("Space");
    const input = page.getByPlaceholder(/Rechercher une action/);
    await expect(input).toBeVisible();
    await input.fill("grille 48");
    await page.getByRole("option", { name: /Grille : 48 px/ }).click();
    await expect(input).toHaveCount(0);

    // Le réglage est RENDU sur la carte, pas seulement stocké (le PATCH REST
    // et le refresh de la liste sont asynchrones → on poll).
    await expect(page.locator(".map-grid--overlay")).toBeVisible();
    await expect
      .poll(async () =>
        page.locator(".map-grid--overlay").evaluate((el) => getComputedStyle(el).backgroundSize),
      )
      .toContain("48px");
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
    const journal = page.locator(".journal-panel");
    await expect(journal).toBeVisible();

    await page.getByRole("button", { name: "Fermer le journal" }).click();
    await expect(journal).toHaveCount(0);

    // L'état survit au rechargement (localStorage, par navigateur).
    await page.reload();
    await expect(page.locator(".mode-toggle")).toBeVisible();
    await expect(page.locator(".journal-panel")).toHaveCount(0);

    // Le raccourci J le rouvre.
    await page.keyboard.press("j");
    await expect(page.locator(".journal-panel")).toBeVisible();
  });
});

test.describe("Carte : import d'image", () => {
  test("le MJ importe une image et la carte devient jouable", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      dialog.getByRole("button", { name: "Nouvelle carte…" }).click(),
    ]);
    await chooser.setFiles({
      name: "donjon.png",
      mimeType: "image/png",
      // PNG 2x2 valide, encodé en base64.
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVQI12NkYPjPgAcw4ZMcVQAAAOJ9Wl2nJwAAAAAElFTkSuQmCC",
        "base64",
      ),
    });

    // La carte importée apparaît dans la grille…
    await expect(dialog.locator('.asset-card[data-kind="map"]', { hasText: "donjon" })).toHaveCount(
      1,
    );
    // …elle devient active et son image est affichée sur la table.
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "donjon");
    await expect(page.locator(".map-img")).toBeVisible();
  });

  test("un fichier qui n'est pas une image est refusé proprement", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      dialog.getByRole("button", { name: "Nouvelle carte…" }).click(),
    ]);
    await chooser.setFiles({
      name: "pas-une-image.png",
      mimeType: "image/png",
      buffer: Buffer.from("ceci n'est pas un PNG"),
    });

    // L'échec est visible (toast global) et la bibliothèque survit.
    await expect(page.locator(".toast")).toContainText("Import de la carte impossible");
    await expect(
      dialog.locator('.asset-card[data-kind="map"]', { hasText: "Carte illustrée" }),
    ).toHaveCount(1);
  });
});

test.describe("Carte : grille et vue", () => {
  test("le quadrillage réglable par le MJ apparaît sur la carte", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

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
    await selectMap(page, "Carte illustrée");

    const grid = page.locator(".map-grid--overlay");
    await expect(grid).toBeVisible();
    // Par défaut : couleur du thème, donc pas de rendu en teinte.
    await expect(grid).not.toHaveClass(/map-grid--tinted/);

    // Clic droit sur la carte dans la bibliothèque → couleur « rouge ».
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dialog
      .locator('.asset-card[data-kind="map"]', { hasText: "Carte illustrée" })
      .first()
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Couleur de la grille" }).hover();
    await page.getByRole("menuitem", { name: "rouge" }).click();

    // La couleur est RENDUE, pas seulement stockée : la classe active le rendu
    // en teinte et la variable CSS est calculée.
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

  test("le MJ peut retirer le quadrillage depuis la bibliothèque", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await expect(page.locator(".map-grid--overlay")).toBeVisible();

    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dialog
      .locator('.asset-card[data-kind="map"]', { hasText: "Carte illustrée" })
      .first()
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: /^Grille/ }).hover();
    await page.getByRole("menuitem", { name: "Retirer la grille" }).click();

    // Le quadrillage disparaît de la carte (la liste des cartes est rafraîchie).
    await expect(page.locator(".map-grid--overlay")).toHaveCount(0);
  });

  test("la molette zoome, le bouton du HUD reset à 100 %", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, -600);

    await expect(page.locator(".hud-fit")).not.toHaveText("100 %");
    await page.locator(".hud-fit").click();
    await expect(page.locator(".hud-fit")).toHaveText("100 %");
  });

  test("l'outil Main déplace réellement la carte (quand elle déborde)", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await page.getByRole("button", { name: "Main" }).click();

    const frame = (await page.locator(".map-frame").boundingBox())!;
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;

    // À 100 %, la carte tient dans le cadre plein écran : `clampView` la centre
    // et le panoramique est verrouillé (comportement voulu). On zoome donc
    // d'abord pour créer un débordement — c'est la condition du panoramique.
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -600);
    await expect(page.locator(".hud-fit")).not.toHaveText("100 %");

    const before = (await page.locator(".map-surface").boundingBox())!;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 80, { steps: 12 });
    await page.mouse.up();

    const after = (await page.locator(".map-surface").boundingBox())!;
    // La carte a bougé à l'écran, sans revenir à 100 %.
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(40);
    await expect(page.locator(".hud-fit")).not.toHaveText("100 %");
  });

  test("un JOUEUR déplace la carte : clic droit, ou le bouton du HUD", async ({
    page,
    browser,
  }) => {
    // Le MJ choisit la carte (le panneau Cartes lui est réservé).
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    // Le joueur rejoint SANS re-seeder : sinon le reset purgerait la carte
    // active que le MJ vient de choisir.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.locator(".journal-panel")).toBeVisible();
    await expect(p2.locator(".map-surface")).toBeVisible();

    // 1. Le bouton « Main » existe pour un joueur : c'est le seul outil de sa
    //    barre du bas (les outils MJ sont filtrés par le rôle).
    const hand = p2.getByRole("button", { name: "Main" }).first();
    await expect(hand).toBeVisible();

    // 2. Clic droit glissé = panoramique, sans passer par l'outil Main. Il faut
    //    zoomer d'abord : à 100 % la carte plein écran est centrée et verrouillée.
    const frame = (await p2.locator(".map-frame").boundingBox())!;
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;
    await p2.mouse.move(cx, cy);
    await p2.mouse.wheel(0, -600);
    await expect(p2.locator(".hud-fit")).not.toHaveText("100 %");

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
    await selectMap(page, "Carte illustrée");

    await placeFromLibrary(page, "PNJ", "Gobelin");

    const mjToken = page.locator(".token", { hasText: "Gobelin" });
    await expect(mjToken).toBeVisible();
    await expect(mjToken.locator(".token-hp")).toHaveCount(1);

    // Le joueur voit le pion (le brouillard n'est pas actif) mais jamais ses PV :
    // pnjPvVisible=false par défaut, le serveur envoie pv=null.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.locator(".journal-panel")).toBeVisible();

    const plToken = p2.locator(".token", { hasText: "Gobelin" });
    await expect(plToken).toBeVisible();
    await expect(plToken.locator(".token-hp")).toHaveCount(0);

    await ctx.close();
  });

  test("la plaque de nom n'apparaît qu'au survol du pion", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");

    const token = page.locator(".token", { hasText: "Kaelith" });
    const label = token.locator(".token-label");
    await expect(label).toHaveCSS("opacity", "0");
    await token.hover();
    await expect(label).toHaveCSS("opacity", "1");
  });

  test("l'initiative recadre : sans effet à 100 %, centrage une fois zoomé", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");
    await placeFromLibrary(page, "PNJ", "Gobelin");
    await page.locator(".mode-btn", { hasText: "Combat" }).click();

    // Lance l'initiative de chaque PJ en attente : le bouton n'arrive qu'avec
    // le mode combat, on l'attend avant de cliquer.
    const pendingRoll = page.locator(".roll-init-btn:not([disabled])");
    await expect(pendingRoll.first()).toBeVisible();
    for (let round = 0; round < 3 && (await pendingRoll.count()) > 0; round += 1) {
      await pendingRoll.first().click();
      await page.waitForTimeout(150);
    }
    const rows = page.locator(".init-row");
    await expect(rows.first()).toBeVisible();

    // La carte tient entièrement dans le cadre : cliquer ne doit RIEN changer.
    const before = (await page.locator(".map-surface").boundingBox())!;
    await rows.first().click();
    await page.waitForTimeout(700);
    const after = (await page.locator(".map-surface").boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);

    // Zoomée : le pion de la ligne vient au centre du cadre (animation 400 ms).
    const name = (await rows.first().getAttribute("data-name")) ?? "";
    const token = page.locator(".token", { hasText: name });
    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(200);
    await rows.first().click();
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
    await selectMap(page, "Carte illustrée");

    await placePjFromFrame(page, "Kaelith");
    const token = page.locator(".token", { hasText: "Kaelith" });
    await expect(token).toBeVisible();
    // Grille du seed : 32 px ; échelle par défaut : 1 case.
    await expect.poll(async () => Math.round((await token.boundingBox())!.width)).toBe(32);

    // Un joueur suit le changement (le réglage est diffusé, pas local).
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.locator(".journal-panel")).toBeVisible();
    const plToken = p2.locator(".token", { hasText: "Kaelith" });

    // Taille du pion : clic droit sur le frame → sous-menu « Taille du pion ».
    await page.locator(".gf", { hasText: "Kaelith" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Taille du pion" }).hover();
    await page.getByRole("menuitem", { name: "2 cases" }).click();
    await expect.poll(async () => Math.round((await token.boundingBox())!.width)).toBe(64);
    await expect.poll(async () => Math.round((await plToken.boundingBox())!.width)).toBe(64);

    await ctx.close();
  });
});

test.describe("Historique (Lot 4)", () => {
  test("les boutons undo/redo ramènent un pion posé, puis le remettent", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    const undoBtn = page.getByRole("button", { name: "Annuler" });
    const redoBtn = page.getByRole("button", { name: "Rétablir" });
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();

    await placePjFromFrame(page, "Kaelith");
    const token = page.locator(".token", { hasText: "Kaelith" });
    await expect(token).toBeVisible();
    await expect(undoBtn).toBeEnabled();

    await undoBtn.click();
    await expect(token).toHaveCount(0);
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeEnabled();

    await redoBtn.click();
    await expect(page.locator(".token", { hasText: "Kaelith" })).toBeVisible();
    await expect(redoBtn).toBeDisabled();
  });

  test("un drag complet est UN pas : Ctrl+Z annule tout le geste", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");

    const token = page.locator(".token", { hasText: "Kaelith" });
    await expect(token).toBeVisible();
    const before = (await token.boundingBox())!;

    // Drag de pion : plusieurs messages token.move, UN seul pas d'undo.
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 70, {
      steps: 14,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Math.abs((await token.boundingBox())!.x - before.x))
      .toBeGreaterThan(40);

    // Ctrl+Z : le geste entier revient à sa position initiale.
    await page.keyboard.press("Control+z");
    await expect
      .poll(async () => Math.abs((await token.boundingBox())!.x - before.x))
      .toBeLessThan(2);
  });
});

test.describe("Panneaux et initiative (Lot 5)", () => {
  test("le panneau Compagnie se déplace et garde sa position au rechargement", async ({ page }) => {
    await openTable(page, MJ);
    // La Compagnie est la liste complète de secours : elle s'ouvre par la palette.
    await page.getByRole("button", { name: "Command palette (Espace)" }).click();
    await page.getByPlaceholder(/rechercher une action/i).fill("compagnie");
    await page.locator(".palette-item", { hasText: "Compagnie (liste complète)" }).click();
    const panel = page.locator(".compagnie");
    await expect(panel).toBeVisible();
    const before = (await panel.boundingBox())!;

    const header = panel.locator(".panel-head");
    const hb = (await header.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 130, hb.y + hb.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    const moved = (await panel.boundingBox())!;
    expect(moved.x - before.x).toBeGreaterThan(100);

    // Persistance normalisée : un rechargement restitue la même position.
    await page.reload();
    await expect(page.locator(".journal-panel")).toBeVisible();
    const after = (await page.locator(".compagnie").boundingBox())!;
    expect(Math.abs(after.x - moved.x)).toBeLessThan(3);
    expect(Math.abs(after.y - moved.y)).toBeLessThan(3);
  });

  test("la bibliothèque : recherche, double-clic sur une carte, onglet PNJ", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await expect(dialog).toBeVisible();

    // Filtrage strict : les PNJ ne sont PAS dans Personnages.
    await dialog.getByRole("tab", { name: /Personnages/ }).click();
    await expect(dialog.locator('.asset-card[data-kind="pnj"]')).toHaveCount(0);
    await expect(dialog.locator('.asset-card[data-kind="pj"]')).toHaveCount(2);
    await dialog.getByRole("tab", { name: /PNJ/ }).click();
    await expect(
      dialog.locator('.asset-card[data-kind="pnj"]', { hasText: "Gobelin" }),
    ).toHaveCount(1);
    await dialog.getByRole("tab", { name: /Cartes/ }).click();

    // Recherche : seule « Carte quadrillée » reste.
    const search = dialog.getByLabel("Rechercher dans la bibliothèque");
    await search.fill("quadr");
    await expect(dialog.locator(".asset-card", { hasText: "Carte illustrée" })).toHaveCount(0);
    await expect(dialog.locator(".asset-card", { hasText: "Carte quadrillée" })).toHaveCount(1);

    // Double-clic = afficher la carte, l'overlay se referme.
    await dialog.locator(".asset-card", { hasText: "Carte quadrillée" }).dblclick();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "Carte quadrillée");
  });

  test("l'onglet PNJ pose ×N en un double-clic (badge − ×N +)", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    // Place le gobelin (bibliothèque), puis enregistre-le comme modèle par le
    // menu du frame — le chemin de la Compagnie a disparu avec elle.
    await placeFromLibrary(page, "PNJ", "Gobelin");
    await page.locator(".gf", { hasText: "Gobelin" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Enregistrer comme modèle" }).click();
    // L'original repart de la carte : le test ne compte que la pose ×N.
    await page.locator(".gf", { hasText: "Gobelin" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Retirer de la carte" }).click();
    await expect(page.locator(".token", { hasText: "Gobelin" })).toHaveCount(0);
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: /PNJ/ }).click();

    const card = dialog.locator('.asset-card[data-kind="template"]', { hasText: "Gobelin" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Plus" }).click();
    await expect(card.locator(".asset-qty-n")).toHaveText("×2");

    // Double-clic : arme la pose ×2 et ferme l'overlay ; un clic sur la carte pose les deux.
    await card.dblclick();
    await expect(dialog).toHaveCount(0);
    // La pose est armée : le hint est la confirmation visible avant le clic.
    await expect(page.locator(".tool-hint-chip")).toContainText("Gobelin");
    await page.locator(".map-frame").click({ position: { x: 640, y: 360 } });
    await expect(page.locator(".token", { hasText: "Gobelin" })).toHaveCount(2);

    // Clic droit sur la vignette : le menu unique s'ouvre AU-DESSUS de la
    // bibliothèque (il doit être cliquable, pas seulement visible).
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: /PNJ/ }).click();
    await dialog
      .locator('.asset-card[data-kind="template"]', { hasText: "Gobelin" })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Supprimer le modèle" }).click();
    await expect(dialog.locator('.asset-card[data-kind="template"]')).toHaveCount(0);
  });

  test("bibliothèque : modifier un modèle PNJ (nom, PV, CA)", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placeFromLibrary(page, "PNJ", "Gobelin");
    await page.locator(".gf", { hasText: "Gobelin" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Enregistrer comme modèle" }).click();

    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dialog.getByRole("tab", { name: /PNJ/ }).click();
    await dialog
      .locator('.asset-card[data-kind="template"]', { hasText: "Gobelin" })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Modifier…" }).click();

    const edit = page.getByRole("dialog", { name: "Modifier le modèle" });
    await expect(edit).toBeVisible();
    await edit.getByLabel("Nom").fill("Chef de meute");
    await edit.getByLabel("PV max").fill("14");
    await edit.getByLabel("CA").fill("16");
    await edit.getByRole("button", { name: "Enregistrer" }).click();

    const card = dialog.locator('.asset-card[data-kind="template"]', { hasText: "Chef de meute" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("CA 16 · PV 14");

    // Nettoyage : le test ×N suivant chercherait aussi « Gobelin ».
    await card.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Supprimer le modèle" }).click();
    await expect(dialog.locator('.asset-card[data-kind="template"]')).toHaveCount(0);
  });

  test("bibliothèque : upload d'une carte et renommage par le menu", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await expect(dialog).toBeVisible();

    // Upload : la tuile « Nouvelle carte… » ouvre le sélecteur de fichier.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      dialog.getByRole("button", { name: "Nouvelle carte…" }).click(),
    ]);
    await chooser.setFiles({ name: "crypte.png", mimeType: "image/png", buffer: png });
    await expect(dialog.locator('.asset-card[data-kind="map"]', { hasText: "crypte" })).toHaveCount(
      1,
    );

    // Renommage par le menu contextuel.
    await dialog
      .locator('.asset-card[data-kind="map"]', { hasText: "Carte illustrée" })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: /Renommer/ }).click();
    const prompt = page.getByRole("dialog", { name: "Renommer la carte" });
    await expect(prompt).toBeVisible();
    await prompt.getByLabel("Nom").fill("Crypte oubliée");
    await prompt.getByRole("button", { name: "Renommer" }).click();
    await expect(
      dialog.locator('.asset-card[data-kind="map"]', { hasText: "Crypte oubliée" }),
    ).toHaveCount(1);
  });

  test("bibliothèque : changer l'avatar d'un PNJ (upload)", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dialog.getByRole("tab", { name: /PNJ/ }).click();

    const card = dialog.locator('.asset-card[data-kind="pnj"]', { hasText: "Gobelin" });
    await expect(card).toBeVisible();
    await card.click({ button: "right" });

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("menuitem", { name: /Changer l'avatar/ }).click(),
    ]);
    await chooser.setFiles({ name: "gobelin.png", mimeType: "image/png", buffer: png });

    // La fiche est repoussée par le DO (broadcast) : la vignette montre
    // l'image, et elle se CHARGE réellement (naturalWidth > 0, pas un 404).
    await expect(card.locator("img")).toHaveCount(1);
    await expect
      .poll(async () => card.locator("img").evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test("les liens : poser, déplacer, voyager, et un retour posé à la main", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "Carte illustrée");

    // Clic droit dans le vide → « Poser un lien ici… » → sous-menu des cartes.
    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + 230, { button: "right" });
    await page.getByRole("menuitem", { name: /Poser un lien ici/ }).hover();
    await page.getByRole("menuitem", { name: /Carte quadrillée/ }).click();

    const link = page.locator(".map-link", { hasText: "Carte quadrillée" });
    await expect(link).toHaveCount(1);

    // Drag du pin (MJ) : il se déplace, et le relâchement ne VOYAGE pas.
    const before = (await link.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2 + 50, {
      steps: 10,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Math.abs((await link.boundingBox())!.x - before.x))
      .toBeGreaterThan(50);
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "Carte illustrée");

    // Clic = voyage ; aucun retour automatique sur la carte cible.
    await link.click();
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "Carte quadrillée");
    await expect(page.locator(".map-link")).toHaveCount(0);

    // Le MJ pose le retour À LA MAIN, puis revient avec.
    await page.mouse.click(frame.x + frame.width / 2, frame.y + 230, { button: "right" });
    await page.getByRole("menuitem", { name: /Poser un lien ici/ }).hover();
    await page.getByRole("menuitem", { name: /Carte illustrée/ }).click();
    const back = page.locator(".map-link", { hasText: "Carte illustrée" });
    await expect(back).toHaveCount(1);
    await back.click();
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "Carte illustrée");
  });

  test("notes épinglées : créer, écrire en markdown, relire", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + 230, { button: "right" });
    await page.getByRole("menuitem", { name: /Poser une note ici/ }).click();
    const prompt = page.getByRole("dialog", { name: "Nouvelle note" });
    await prompt.getByLabel("Titre").fill("Salle du trône");
    await prompt.getByRole("button", { name: "Créer" }).click();

    // Le panneau s'ouvre en édition ; on écrit du markdown léger.
    const panel = page.locator(".pin-panel");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Contenu de la note").fill("Des **pièces d'or** au sol.");
    await panel.getByRole("button", { name: "Enregistrer" }).click();
    await expect(panel.locator("strong")).toHaveText("pièces d'or");

    // Fermer puis rouvrir par le pin rend la même note.
    await panel.getByRole("button", { name: "Fermer la note" }).click();
    await expect(panel).toHaveCount(0);
    await page.locator(".map-pin", { hasText: "Salle du trône" }).click();
    await expect(page.locator(".pin-panel strong")).toHaveText("pièces d'or");
  });

  test("renommer un lien par le clic droit", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + 230, { button: "right" });
    await page.getByRole("menuitem", { name: /Poser un lien ici/ }).hover();
    await page.getByRole("menuitem", { name: /Carte quadrillée/ }).click();

    const link = page.locator(".map-link", { hasText: "Carte quadrillée" });
    await expect(link).toHaveCount(1);
    await link.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Renommer/ }).click();
    const prompt = page.getByRole("dialog", { name: "Renommer le lien" });
    await expect(prompt).toBeVisible();
    await prompt.getByLabel("Nom").fill("Porte de la crypte");
    await prompt.getByRole("button", { name: "Renommer" }).click();
    await expect(page.locator(".map-link", { hasText: "Porte de la crypte" })).toHaveCount(1);
    await expect(page.locator(".map-link", { hasText: "Carte quadrillée" })).toHaveCount(0);
  });

  test("les liens cachés ne sont pas visibles par les joueurs", async ({ page, browser }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + 230, { button: "right" });
    await page.getByRole("menuitem", { name: /Poser un lien ici/ }).hover();
    await page.getByRole("menuitem", { name: /Carte quadrillée/ }).click();

    const link = page.locator(".map-link", { hasText: "Carte quadrillée" });
    await expect(link).toHaveCount(1);
    await link.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Cacher aux joueurs" }).click();
    await expect(page.locator(".map-link.link-hidden")).toHaveCount(1);

    // Badge dans la bibliothèque MJ.
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dialog.getByRole("tab", { name: /Liens/ }).click();
    await expect(dialog.locator(".link-row", { hasText: "caché" })).toHaveCount(1);
    await page.keyboard.press("Escape");

    // Le joueur ne voit RIEN.
    const playerCtx = await browser.newContext();
    const p2 = await playerCtx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.locator(".journal-panel")).toBeVisible();
    await expect(p2.locator(".map-link")).toHaveCount(0);
    await playerCtx.close();
  });

  test("les liens : onglet Liens de la bibliothèque", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + 230, { button: "right" });
    await page.getByRole("menuitem", { name: /Poser un lien ici/ }).hover();
    await page.getByRole("menuitem", { name: /Carte quadrillée/ }).click();
    await expect(page.locator(".map-link", { hasText: "Carte quadrillée" })).toHaveCount(1);

    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dialog.getByRole("tab", { name: /Liens/ }).click();
    await expect(dialog.locator(".link-row", { hasText: "Carte quadrillée" })).toHaveCount(1);

    // « aller » depuis la bibliothèque voyage et referme l'overlay.
    await dialog.getByRole("button", { name: "aller" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".map-frame")).toHaveAttribute("data-map", "Carte quadrillée");
  });

  test("aperçu au survol (Ctrl) sur un pion", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");
    const token = page.locator(".token", { hasText: "Kaelith" });
    await expect(token).toBeVisible();

    await page.keyboard.down("Control");
    await token.hover();
    const preview = page.locator(".token-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Kaelith");
    await expect(preview).toContainText(/CA \d+/);

    await page.keyboard.up("Control");
    await expect(preview).toHaveCount(0);
  });

  test("le tableau de bord MJ liste les PNJ de la scène et garde les notes de carte", async ({
    page,
  }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placeFromLibrary(page, "PNJ", "Gobelin");

    // Ouverture par la palette (surface à la demande).
    await page.keyboard.press("Space");
    const input = page.getByPlaceholder(/Rechercher une action/);
    await input.fill("tableau de bord");
    await page.getByRole("option", { name: /Tableau de bord MJ/ }).click();

    const dash = page.locator(".dashboard");
    await expect(dash).toBeVisible();
    await expect(dash).toContainText("Gobelin");
    await expect(dash.locator(".dash-hp")).toHaveCount(1);

    // Note de carte : enregistrée puis rechargée après rechargement de page
    // (le panneau ouvert est persistant, comme les autres).
    await dash.getByLabel("Notes de la carte").fill("La porte grince au sud.");
    await dash.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dash.locator(".dash-note-state")).toHaveText("à jour");

    await page.reload();
    await expect(page.locator(".journal-panel")).toBeVisible();
    const dash2 = page.locator(".dashboard");
    await expect(dash2).toBeVisible();
    await expect(dash2.getByLabel("Notes de la carte")).toHaveValue("La porte grince au sud.");
  });

  test("clic droit sur un pion : menu contextuel unique (dupliquer)", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placeFromLibrary(page, "PNJ", "Gobelin");

    const token = page.locator(".token", { hasText: "Gobelin" });
    await expect(token).toBeVisible();
    await token.click({ button: "right" });

    await expect(page.getByRole("menuitem", { name: "Dupliquer le PNJ" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Taille du pion" }).hover();
    await expect(page.getByRole("menuitem", { name: "1 case" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Dupliquer le PNJ" }).click();
    await expect(page.locator(".token", { hasText: "Gobelin" })).toHaveCount(2);
  });

  test("clic droit dans le vide : menu de carte (outils MJ)", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height - 140, {
      button: "right",
    });
    await expect(page.getByRole("menuitem", { name: "Outil PNJ" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Outil PNJ" })).toHaveCount(0);
  });

  test("l'initiative verticale montre les PV et se réordonne (▲)", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");
    await placeFromLibrary(page, "PNJ", "Gobelin");
    await page.locator(".mode-btn", { hasText: "Combat" }).click();

    const pendingRoll = page.locator(".roll-init-btn:not([disabled])");
    await expect(pendingRoll.first()).toBeVisible();
    for (let round = 0; round < 3 && (await pendingRoll.count()) > 0; round += 1) {
      await pendingRoll.first().click();
      await page.waitForTimeout(150);
    }

    const rows = page.locator(".init-row");
    await expect(rows).toHaveCount(2);
    await expect(page.locator(".init-move").first()).toBeVisible();
    // Le MJ voit les barres de PV sur les lignes.
    await expect(rows.first().locator(".init-hp")).toHaveCount(1);

    const names = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-name")));
    const order = await names();
    await rows
      .last()
      .getByRole("button", { name: /^Monter/ })
      .click();
    await expect.poll(names).toEqual([order[1], order[0]]);
  });
});

test.describe("Fiche en panneau (Lot 7)", () => {
  test("le MJ ouvre la fiche d'un PJ depuis la Compagnie, sans quitter la table", async ({
    page,
  }) => {
    await openTable(page, MJ);
    const urlAvant = page.url();

    await page.locator(".gf", { hasText: "Kaelith" }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Ouvrir la feuille" }).click();
    const fiche = page.locator(".panel-surface", { hasText: "Feuille de personnage" });
    await expect(fiche).toBeVisible();
    await expect(fiche).toContainText("Kaelith");
    expect(page.url()).toBe(urlAvant);

    await fiche.getByRole("button", { name: "Fermer la fiche" }).click();
    await expect(fiche).toHaveCount(0);
  });

  test("un joueur ouvre sa feuille par la palette", async ({ page }) => {
    await openTable(page, KAELITH);
    await page.getByRole("button", { name: "Command palette (Espace)" }).click();
    await page.getByPlaceholder(/rechercher une action/i).fill("feuille");
    await page.locator(".palette-item", { hasText: "Ouvrir ma feuille de personnage" }).click();

    const fiche = page.locator(".panel-surface", { hasText: "Feuille de personnage" });
    await expect(fiche).toBeVisible();
    await expect(fiche).toContainText("Kaelith");
    // Le propriétaire édite : les valeurs éditables sont rendues.
    await expect(fiche.locator(".ed").first()).toBeVisible();
  });
});

test.describe("Compendium par-dessus la table (Lot 7)", () => {
  test("la fenêtre s'ouvre sans quitter la séance, et se ferme", async ({ page }) => {
    await openTable(page, MJ);
    const urlAvant = page.url();

    await page.getByRole("button", { name: "Compendium", exact: true }).click();
    const win = page.locator(".compendium-window");
    await expect(win).toBeVisible();
    await expect(win.locator(".rail-item").first()).toBeVisible();
    expect(page.url()).toBe(urlAvant);

    await page.keyboard.press("Escape");
    await expect(win).toHaveCount(0);
    await expect(page.locator(".journal-panel")).toBeVisible();
  });

  test("un partage du journal rouvre la fenêtre sur la fiche", async ({ page }) => {
    await openTable(page, MJ);

    await page.getByRole("button", { name: "Compendium", exact: true }).click();
    const win = page.locator(".compendium-window");
    const premiere = win.locator(".list .row").first();
    await expect(premiere).toBeVisible();
    await premiere.click();
    const titre = await win.locator(".entry-head h2").innerText();

    await win.getByRole("button", { name: "Partager au journal" }).click();
    await expect(win.getByText("partagée au journal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(win).toHaveCount(0);

    const chip = page.locator(".share-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(titre);
    await chip.click();

    await expect(win).toBeVisible();
    await expect(win.locator(".entry-head h2")).toHaveText(titre);
    expect(new URL(page.url()).pathname).toContain(`/campaigns/${CAMPAIGN}/table`);
  });
});

test.describe("GroupFrame (Lot 10)", () => {
  test("le frame liste les PJ, soigne au survol et cible au clic", async ({ page }) => {
    await openTable(page, MJ);
    const rail = page.locator(".group-rail");
    await expect(rail).toContainText("Kaelith");
    // Un PNJ non posé n'est pas dans le frame (il vit dans la bibliothèque).
    await expect(rail).not.toContainText("Gobelin");

    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");

    // Soigner : survol de la barre → − / + (MJ), sans quitter la table.
    const frame = page.locator(".gf", { hasText: "Kaelith" });
    await frame.locator(".gf-hp-wrap").hover();
    await frame.getByRole("button", { name: /Retirer 1 PV/ }).click();
    await expect(frame).toContainText("44 / 45");
    await frame.locator(".gf-hp-wrap").hover();
    await frame.getByRole("button", { name: /Rendre 1 PV/ }).click();
    await expect(frame).toContainText("45 / 45");

    // Un double-clic rapide sur − soigne deux fois, sans cibler ni recentrer.
    await frame.locator(".gf-hp-wrap").hover();
    await frame.getByRole("button", { name: /Retirer 1 PV/ }).dblclick();
    await expect(frame).toContainText("43 / 45");
    await expect(page.locator(".target")).toHaveCount(0);
    await expect(page.locator(".token", { hasText: "Kaelith" })).toHaveCount(1);

    // Clic = cibler / retirer la cible.
    await frame.click();
    await expect(page.locator(".target")).toContainText("Kaelith");
    await frame.click();
    await expect(page.locator(".target")).toHaveCount(0);
  });
});

test.describe("Widgets (Lot 8)", () => {
  test("le MJ pilote compteur/horloge/minuteur, le joueur voit sans contrôler", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);

    // Compteur.
    await page.getByRole("button", { name: "Augmenter le compteur" }).click();
    await page.getByRole("button", { name: "Augmenter le compteur" }).click();
    await expect(page.locator(".widget", { hasText: "compteur" }).locator(".w-value")).toHaveText(
      "2",
    );

    // Horloge : cliquer le 5e secteur la remplit jusqu'à 5.
    await page.locator(".clock path").nth(4).click();
    await expect(page.locator(".clock")).toHaveAttribute("aria-label", /: 5 sur 12$/);

    // Minuteur : durée 0:05 puis lecture/pause.
    await page.locator(".timer-value").dblclick();
    const input = page.getByLabel("Durée du minuteur");
    await input.fill("0:05");
    await input.press("Enter");
    await page.getByRole("button", { name: "Démarrer" }).click();
    await expect(page.getByRole("button", { name: "Mettre en pause" })).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Mettre en pause" }).click();
    await expect(page.locator(".timer-value")).toHaveText(/0:0[1-5]/);

    // Le joueur reçoit les valeurs mais n'a aucun contrôle.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(p2.locator(".clock")).toHaveAttribute("aria-label", /: 5 sur 12$/);
    await expect(p2.locator(".widget", { hasText: "compteur" }).locator(".w-value")).toHaveText(
      "2",
    );
    await expect(p2.getByRole("button", { name: "Augmenter le compteur" })).toHaveCount(0);
    await expect(p2.getByRole("button", { name: "Démarrer" })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("Repères (Lot 8)", () => {
  test("poser un repère demande son nom, le double-clic le renomme", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    await page.getByRole("button", { name: "Repère", exact: true }).click();
    const frame = (await page.locator(".map-frame").boundingBox())!;
    await page.mouse.click(frame.x + 700, frame.y + 400);

    const prompt = page.getByRole("dialog", { name: "Nouveau repère" });
    await expect(prompt).toBeVisible();
    await prompt.getByLabel("Nom du repère").fill("Porte sud");
    await prompt.getByRole("button", { name: "Poser" }).click();

    const marker = page.locator(".marker", { hasText: "Porte sud" });
    await expect(marker).toBeVisible();

    // Double-clic direct sur le repère = renommer.
    await marker.dblclick();
    const rename = page.getByRole("dialog", { name: "Renommer le repère" });
    await expect(rename).toBeVisible();
    await rename.getByLabel("Nom du repère").fill("Porte nord");
    await rename.getByRole("button", { name: "Renommer" }).click();
    await expect(page.locator(".marker", { hasText: "Porte nord" })).toBeVisible();
  });
});

test.describe("Accessibilité (Lot 8)", () => {
  test("le journal est une région live", async ({ page }) => {
    await openTable(page, MJ);
    await expect(page.locator(".journal-list")).toHaveAttribute("role", "log");
    await expect(page.locator(".journal-list")).toHaveAttribute("aria-live", "polite");
  });

  test("un pion est focusable, se déplace aux flèches et se cible à Entrée", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");

    const token = page.locator(".token", { hasText: "Kaelith" });
    await token.focus();
    const before = (await token.boundingBox())!;
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => Math.abs((await token.boundingBox())!.x - before.x))
      .toBeGreaterThan(20);

    // Entrée = même action que le clic : cibler (MJ).
    await page.keyboard.press("Enter");
    await expect(page.locator(".target")).toContainText("Kaelith");
  });
});

test.describe("Tutoriel (Lot 8)", () => {
  test("se lance une fois par navigateur, se parcourt et se ferme", async ({ browser }) => {
    // Contexte SANS l'initScript de `login` : le tutoriel doit s'auto-ouvrir.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await seed(page.request);
    await page.request.post("/api/dev/login", { data: { user: MJ } });
    await page.goto(`/campaigns/${CAMPAIGN}/table`);

    const tut = page.getByRole("dialog", { name: "Tutoriel" });
    await expect(tut).toBeVisible();
    await expect(tut).toContainText("Étape 1 / 4");
    await expect(tut).toContainText("La compagnie");

    await tut.getByRole("button", { name: "Suivant" }).click();
    await expect(tut).toContainText("Étape 2 / 4");
    await tut.getByRole("button", { name: "Suivant" }).click();
    await tut.getByRole("button", { name: "Suivant" }).click();
    await expect(tut).toContainText("Étape 4 / 4");
    await tut.getByRole("button", { name: "Terminer" }).click();
    await expect(tut).toHaveCount(0);

    // Marqué vu : un rechargement ne le rouvre plus.
    await page.reload();
    await expect(page.locator(".journal-panel")).toBeVisible();
    await expect(tut).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("Toasts et squelettes (Lot 8)", () => {
  test("une erreur réseau s'affiche dans le toast global", async ({ page }) => {
    await seed(page.request);
    await login(page, MJ);
    // La liste des cartes échoue : l'utilisateur doit le voir, pas un silence.
    await page.route("**/api/maps/campaigns/**", (route) => route.abort());
    await page.goto(`/campaigns/${CAMPAIGN}/table`);
    await expect(page.locator(".toast")).toContainText("Liste des cartes indisponible");
  });
});

test.describe("Fenêtres et DicePad (Lot 10)", () => {
  test("le panneau se réduit à sa barre de titre et se restaure", async ({ page }) => {
    await openTable(page, MJ);
    const panel = page.locator(".journal-panel");

    await page.getByRole("button", { name: "Réduire journal" }).click();
    await expect(page.locator(".journal-tab")).toHaveCount(0);
    const collapsed = (await panel.boundingBox())!;
    expect(collapsed.height).toBeLessThan(60);

    await page.getByRole("button", { name: "Agrandir journal" }).click();
    await expect(page.locator(".journal-tab")).toBeVisible();
  });

  test("le DiceButton ouvre le pad et porte le dernier résultat en badge", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Ouvrir les dés" }).click();
    await expect(page.locator(".dice-panel")).toBeVisible();

    await page.getByRole("button", { name: /Lancer 1d20 \+ 0/ }).click();
    await expect(page.locator(".dice-badge")).toHaveText(/\d+/);
  });

  test("le DicePad : modificateur, dé choisi, lancer et résultat en historique", async ({
    page,
  }) => {
    await openTable(page, MJ);
    await openPanel(page, "dice");

    await page.getByRole("button", { name: "Augmenter le modificateur" }).click();
    await expect(page.locator(".mod-value")).toHaveText("+1");

    await page.getByRole("button", { name: "D6", exact: true }).click();
    const launch = page.getByRole("button", { name: /Lancer 1d6 \+ 1/ });
    await expect(launch).toBeVisible();
    await launch.click();

    await expect(page.locator(".history-entry").first()).toHaveText(/1d6\+1 → \d+/);
  });
});

test.describe("TopActions (Lot 10)", () => {
  test("le bouton Tableau de bord ouvre le panneau, l'aide s'ouvre au clic", async ({ page }) => {
    await openTable(page, MJ);
    await page.getByRole("button", { name: "Tableau de bord" }).click();
    await expect(page.locator(".dashboard")).toBeVisible();

    await page.getByRole("button", { name: "Aide clavier" }).click();
    await expect(page.locator(".help-title")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".help-title")).toHaveCount(0);
  });
});

test.describe("Cible partagée (Lot 10)", () => {
  test("le MJ cible un pion : le cadre apparaît chez tous, seul le MJ le ferme", async ({
    page,
    browser,
  }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");
    await placePjFromFrame(page, "Kaelith");

    const token = page.locator(".token", { hasText: "Kaelith" });
    await token.click();
    const frame = page.locator(".target");
    await expect(frame).toContainText("Kaelith");
    await expect(frame).toContainText("CA");

    // Le joueur voit la même cible, sans bouton de fermeture.
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await login(p2, KAELITH);
    await p2.goto(`/campaigns/${CAMPAIGN}/table`);
    const frame2 = p2.locator(".target");
    await expect(frame2).toContainText("Kaelith");
    await expect(p2.getByRole("button", { name: "Retirer la cible" })).toHaveCount(0);

    // Un joueur ne cible pas : cliquer un autre pion ne change pas la cible.
    await p2.locator(".token", { hasText: "Kaelith" }).click();
    await p2.waitForTimeout(200);
    await expect(frame2).toContainText("Kaelith");

    // Le MJ ferme : le cadre disparaît partout.
    await frame.getByRole("button", { name: "Retirer la cible" }).click();
    await expect(frame).toHaveCount(0);
    await expect(frame2).toHaveCount(0);

    // Re-clic sur le pion : la cible revient (toggle).
    await token.click();
    await expect(frame).toContainText("Kaelith");
    await ctx.close();
  });
});

test.describe("Brouillard (Lot 8.8)", () => {
  test("les formes du MJ (rectangle, lasso) percent le voile", async ({ page }) => {
    await openTable(page, MJ);
    await selectMap(page, "Carte illustrée");

    // Outil brouillard -> « Tout recouvrir » + mode Rectangle. NB : Escape
    // ferme le popover mais remet l'outil sur « move » (raccourci global) :
    // on réactive Brouillard ensuite.
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();
    await page.getByRole("button", { name: "Options — Brouillard" }).click();
    await page.getByRole("button", { name: "Tout recouvrir" }).click();
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();

    const alphaAt = (fx: number, fy: number) =>
      page.locator("canvas.fog-canvas").evaluate(
        (c, [x, y]) => {
          const canvas = c as HTMLCanvasElement;
          const ctx = canvas.getContext("2d");
          if (!ctx) return -1;
          return ctx.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1)
            .data[3];
        },
        [fx, fy],
      );

    // Le voile est opaque au point de départ (20 %, 20 %).
    await expect.poll(() => alphaAt(0.2, 0.2)).toBe(255);

    const box = await page.locator(".map-surface").boundingBox();
    if (!box) throw new Error("surface introuvable");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 8 });
    await page.mouse.up();

    // Le trou est percé : alpha 0 sur le point de départ du rectangle.
    await expect.poll(() => alphaAt(0.2, 0.2)).toBe(0);
    // Hors du rectangle, le voile reste.
    await expect.poll(() => alphaAt(0.05, 0.9)).toBe(255);

    // Lasso : un losange autour de (85 %, 40 %) doit percer (87 %, 42 %).
    // (Zone libre : ni bannière, ni widgets, ni rail de compagnie.)
    await page.getByRole("button", { name: "Options — Brouillard" }).click();
    await page.getByRole("button", { name: "Lasso" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();
    await expect.poll(() => alphaAt(0.87, 0.42)).toBe(255);

    const at = (px: number, py: number) => ({
      x: box.x + box.width * (px / 100),
      y: box.y + box.height * (py / 100),
    });
    const p0 = at(85, 35);
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    for (const [px, py] of [
      [90, 40],
      [85, 45],
      [80, 40],
    ] as const) {
      const p = at(px, py);
      await page.mouse.move(p.x, p.y, { steps: 4 });
    }
    await page.mouse.up();
    await expect.poll(() => alphaAt(0.87, 0.42)).toBe(0);
  });
});
