/*
 * Quel est le VRAI rapport avant/apres, a la resolution cible ?
 *
 * Le precedent releve comparait 1280x720 grille contre 1280x720 plein ecran.
 * C'est trompeur : au-dela de 1280 de large, la grille 3 colonnes laisse
 * DEJA une grosse zone carte, parce que les colonnes sont fixes (288 + 324).
 * La vraie question est : sur un 1440p Retina, combien le plein ecran
 * coute-t-il EN MORE par rapport a la grille ACTUELLE sur ce meme ecran ?
 *
 *   node scripts/_rapport-fog.cjs
 */
const { chromium, devices } = require("@playwright/test");

const BASE = "http://localhost:8787";

/* La surcharge du spike, injectee a chaud — aucun fichier du depot n'est touche. */
const SPIKE = `
  .table-screen { position: relative; }
  .table-body { display: block !important; position: absolute !important; inset: 0 !important; }
  .map-area { position: absolute !important; inset: 0 !important; display: block !important; }
  .map-frame { position: absolute !important; inset: 0 !important; margin: 0 !important; }
  .map-header, .combat-bandeau { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 50 !important; }
  .mj-toolbar { position: absolute !important; top: 44px !important; left: 0 !important; right: 0 !important; z-index: 70 !important; }
  .compagnie, .panel { position: absolute !important; top: 96px !important; bottom: 16px !important;
                       z-index: 60 !important; border: 2px solid var(--border) !important;
                       border-radius: 12px !important; box-shadow: 0 10px 32px var(--shadow-2) !important; }
  .compagnie { left: 16px !important; width: var(--w-compagnie) !important; }
  .panel { right: 16px !important; width: var(--w-panel) !important; background: var(--panel) !important; }
`;

function mesurer(o) {
  const w = o.w;
  const h = o.h;
  const fs = o.fs;
  const c = document.createElement("canvas");
  c.width = Math.round(w * fs);
  c.height = Math.round(h * fs);
  const ctx = c.getContext("2d");
  const fois = [];
  for (let r = 0; r < 7; r++) {
    const t0 = performance.now();
    ctx.setTransform(fs, 0, 0, fs, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#3B372E";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(251,248,240,.05)";
    ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    ctx.getImageData(0, 0, 1, 1);
    fois.push(performance.now() - t0);
  }
  fois.sort((a, b) => a - b);
  return { ms: fois[3], mo: (c.width * c.height * 4) / 1048576 };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();

  for (const ecran of [
    { nom: "2560x1440 dpr 2  (le cas worst-case)", w: 2560, h: 1440, dpr: 2 },
    { nom: "1920x1080 dpr 1", w: 1920, h: 1080, dpr: 1 },
    { nom: "1280x720  dpr 1", w: 1280, h: 720, dpr: 1 },
  ]) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.setViewportSize({ width: ecran.w, height: ecran.h });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: ecran.w,
      height: ecran.h,
      deviceScaleFactor: ecran.dpr,
      mobile: false,
    });

    await page.request.post(BASE + "/api/dev/seed", { data: { reset: true } });
    await page.request.post(BASE + "/api/dev/login", { data: { user: "mj" } });
    await page.goto(BASE + "/campaigns/dev-camp/table");
    await page.getByRole("button", { name: "Journal" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Cartes" }).click({ force: true });
    await page.getByRole("button", { name: /Carte illustrée/ }).click({ force: true });
    await page.locator(".map-surface").waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);

    const lire = () =>
      page.evaluate(() => {
        const s = document.querySelector(".map-surface");
        const f = document.querySelector(".map-frame");
        return {
          surface: [s.offsetWidth, s.offsetHeight],
          frame: [f.offsetWidth, f.offsetHeight],
        };
      });

    const grille = await lire();
    await page.addStyleTag({ content: SPIKE });
    await page.waitForTimeout(1000);
    const plein = await lire();

    const fogScale = Math.min(3, Math.max(1, 1 * ecran.dpr)); // zoom 1
    const g = await page.evaluate(mesurer, {
      w: grille.surface[0],
      h: grille.surface[1],
      fs: fogScale,
    });
    const p = await page.evaluate(mesurer, {
      w: plein.surface[0],
      h: plein.surface[1],
      fs: fogScale,
    });

    console.log("\n" + ecran.nom + "   (zoom 1, fogScale " + fogScale.toFixed(1) + ")");
    console.log("                        grille ACTUELLE      ->   plein ecran APRES");
    console.log(
      "  zone carte          " +
        JSON.stringify(grille.frame).padEnd(18) +
        " ->  " +
        JSON.stringify(plein.frame),
    );
    console.log(
      "  map-surface         " +
        JSON.stringify(grille.surface).padEnd(18) +
        " ->  " +
        JSON.stringify(plein.surface),
    );
    console.log(
      "  surface (Mpx)        " +
        (((grille.surface[0] * grille.surface[1]) / 1e6).toFixed(2) + "").padEnd(18) +
        " ->  " +
        ((plein.surface[0] * plein.surface[1]) / 1e6).toFixed(2),
    );
    console.log(
      "  memoire par repeint  " +
        (g.mo.toFixed(1) + " Mo").padEnd(18) +
        " ->  " +
        p.mo.toFixed(1) +
        " Mo   (x" +
        (p.mo / g.mo).toFixed(2) +
        ")",
    );
    console.log(
      "  duree du repeint     " +
        (g.ms.toFixed(1) + " ms").padEnd(18) +
        " ->  " +
        p.ms.toFixed(1) +
        " ms   (x" +
        (p.ms / g.ms).toFixed(2) +
        ")",
    );
  }

  await browser.close();
})();
