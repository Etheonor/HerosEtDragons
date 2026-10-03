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
  await page.getByRole("button", { name: "Journal" }).waitFor();

  // Carte active : sans elle, le HUD de zoom n'est pas rendu.
  await page.getByRole("button", { name: "Bibliothèque" }).click();
  const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
  await dialog.getByRole("tab", { name: /Cartes/ }).click();
  await dialog.locator(".asset-card", { hasText: "Carte illustrée" }).dblclick();
  await page.waitForTimeout(900);

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

  const shots = process.env.SHOT_EXTRA ? process.env.SHOT_EXTRA.split(",") : [];
  for (const s of shots) {
    const [name, sel] = s.split("=");
    const el = page.locator(sel).first();
    if (await el.count()) await el.screenshot({ path: `${OUT}/table-${name}.png` });
  }

  await browser.close();
  console.log("ok");
})();
