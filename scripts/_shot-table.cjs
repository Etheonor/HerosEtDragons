const { chromium } = require("@playwright/test");

const URL = process.env.SHOT_URL || "http://localhost:8787";
const USER = process.env.SHOT_USER || "mj";
const OUT = process.env.SHOT_OUT || "/tmp";

(async () => {
  const W = Number(process.env.SHOT_W || 1920);
  const H = Number(process.env.SHOT_H || 1080);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.request.post(`${URL}/api/dev/seed`, { data: { reset: true } });
  await page.request.post(`${URL}/api/dev/login`, { data: { user: USER } });

  if (process.env.SHOT_SLOW) {
    await page.route("**/api/campaigns", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.goto(`${URL}/`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/home-skeleton.png` });
    await page.unroute("**/api/campaigns");
  }

  await page.goto(`${URL}/campaigns/dev-camp/table`);
  await page.locator(".journal-panel").waitFor();

  // Carte active : sans elle, le HUD de zoom n'est pas rendu.
  await page.getByRole("button", { name: "Bibliothèque" }).click();
  const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
  await dialog.getByRole("tab", { name: /Cartes/ }).click();
  await dialog.locator(".asset-card", { hasText: "Carte illustrée" }).dblclick();
  await page.waitForTimeout(900);

  if (process.env.SHOT_PANELS) {
    await page.locator(".map-frame").click({ position: { x: 700, y: 400 } });
    await page.keyboard.press("d");
    await page.keyboard.press("i");
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${OUT}/table-full.png` });
  await page.screenshot({
    path: `${OUT}/table-top.png`,
    clip: { x: 0, y: 0, width: W, height: 90 },
  });
  await page.screenshot({
    path: `${OUT}/table-bottom.png`,
    clip: { x: 0, y: H - 130, width: W, height: 130 },
  });

  if (process.env.SHOT_DICE) {
    await page.getByRole("button", { name: "Ouvrir les dés" }).click();
    await page.getByRole("button", { name: /Lancer 1d20 \+ 0/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: `${OUT}/dice-spin.png`,
      clip: { x: W / 2 - 220, y: H / 2 - 180, width: 440, height: 360 },
    });
    await page.waitForTimeout(1300);
    await page.screenshot({
      path: `${OUT}/dice-reveal.png`,
      clip: { x: W / 2 - 220, y: H / 2 - 180, width: 440, height: 360 },
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/dice-after.png` });
  }

  if (process.env.SHOT_PANELS) {
    await page.keyboard.press("d");
    await page.keyboard.press("i");
    await page.waitForTimeout(500);
  }

  if (process.env.SHOT_TIMER) {
    await page.locator(".timer-value").dblclick();
    const input = page.getByLabel("Durée du minuteur");
    await input.fill("0:03");
    await input.press("Enter");
    console.log("apres reset:", await page.locator(".timer-value").innerText());
    await page.getByRole("button", { name: "Démarrer" }).click();
    for (let i = 0; i < 40; i++) {
      console.log(`${i * 100}ms`, await page.locator(".timer-value").innerText());
      await page.waitForTimeout(100);
    }
  }

  if (process.env.SHOT_MENU) {
    const info = await page.evaluate(() => {
      const el = document.elementFromPoint(640, 580);
      return el ? `${el.tagName}.${el.className}` : "none";
    });
    console.log("elementFromPoint(640,580):", info);
    await page.mouse.click(640, 580, { button: "right" });
    await page.waitForTimeout(600);
    console.log("menuitems:", await page.locator('[role="menuitem"]').count());
    await page.screenshot({ path: `${OUT}/menu-debug.png` });
  }

  if (process.env.SHOT_COMBAT) {
    await page.locator(".gf", { hasText: "Kaelith" }).dblclick();
    await page.getByRole("button", { name: "Bibliothèque" }).click();
    const dlg = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
    await dlg.getByRole("tab", { name: /PNJ/ }).click();
    await dlg.locator(".asset-card", { hasText: "Gobelin" }).first().dblclick();
    await page.getByRole("button", { name: "Combat", exact: true }).click();
    const pending = page.locator(".roll-init-btn:not([disabled])");
    for (let i = 0; i < 4 && (await pending.count()) > 0; i++) {
      await pending.first().click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/combat.png` });
  }

  if (process.env.SHOT_FOG) {
    const skip = page.getByRole("button", { name: "Passer" });
    if (await skip.count()) {
      await skip.click();
      await page.waitForTimeout(300);
    }
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();
    await page.getByRole("button", { name: "Options — Brouillard" }).click();
    await page.getByRole("button", { name: "Tout recouvrir" }).click();
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();

    const box = await page.locator(".map-surface").boundingBox();
    if (!box) throw new Error("surface introuvable");
    const at = (px, py) => ({
      x: box.x + (box.width * px) / 100,
      y: box.y + (box.height * py) / 100,
    });
    let p = at(20, 20);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    p = at(70, 75);
    await page.mouse.move(p.x, p.y, { steps: 6 });
    await page.screenshot({ path: `${OUT}/fog-rectangle.png` });
    await page.mouse.up();

    await page.getByRole("button", { name: "Options — Brouillard" }).click();
    await page.getByRole("button", { name: "Lasso" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();
    const pts = [
      [85, 35],
      [90, 40],
      [85, 45],
      [80, 40],
    ];
    p = at(pts[0][0], pts[0][1]);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (const [px, py] of pts.slice(1)) {
      p = at(px, py);
      await page.mouse.move(p.x, p.y, { steps: 4 });
    }
    await page.screenshot({ path: `${OUT}/fog-lasso.png` });
    await page.mouse.up();
  }

  if (process.env.SHOT_TIP) {
    await page.getByRole("button", { name: "Aide clavier" }).hover();
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${OUT}/tooltip.png`,
      clip: { x: W - 420, y: 0, width: 420, height: 240 },
    });
  }

  const shots = process.env.SHOT_EXTRA ? process.env.SHOT_EXTRA.split(",") : [];
  for (const s of shots) {
    const [name, sel] = s.split("=");
    const el = page.locator(sel).first();
    if (await el.count()) await el.screenshot({ path: `${OUT}/table-${name}.png` });
  }

  await browser.close();
  console.log("ok");
})();
