const { chromium } = require("@playwright/test");

const URL = process.env.SHOT_URL || "http://localhost:8787";
const USER = process.env.SHOT_USER || "mj";
const OUT = process.env.SHOT_OUT || "/tmp";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.request.post(`${URL}/api/dev/seed`, { data: { reset: true } });
  await page.request.post(`${URL}/api/dev/login`, { data: { user: USER } });
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
    clip: { x: 0, y: 0, width: 1920, height: 90 },
  });
  await page.screenshot({
    path: `${OUT}/table-bottom.png`,
    clip: { x: 0, y: 950, width: 1920, height: 130 },
  });

  const shots = process.env.SHOT_EXTRA ? process.env.SHOT_EXTRA.split(",") : [];
  for (const s of shots) {
    const [name, sel] = s.split("=");
    const el = page.locator(sel).first();
    if (await el.count()) await el.screenshot({ path: `${OUT}/table-${name}.png` });
  }

  await browser.close();
  console.log("ok");
})();
