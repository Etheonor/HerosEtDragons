/*
 * SPIKE Lot 1 — LA mesure : que coûte le brouillard quand la carte passe en
 * plein écran ?
 *
 * On pilote la vraie table (dev-camp, carte illustrée) et on mesure dans les
 * DEUX layouts, en basculant à chaud par une surcharge CSS qui neutralise le
 * spike — donc sans toucher au code de production.
 *
 *   layout « grille » = l'actuel (3 colonnes 288 / 1fr / 324)
 *   layout « plein »  = la surcharge du spike (carte plein écran + panneaux)
 *
 * Le coût du repeint est mesuré en REPRODUISANT exactement drawFogBase() de
 * +page.svelte sur un canvas jetable aux dimensions réelles. On mesure donc le
 * vrai algorithme sur la vraie taille, CPU ralenti x4.
 *
 *   node scripts/_mesure-brouillard.cjs
 */
const { chromium, devices } = require("@playwright/test");

const BASE = "http://localhost:8787";

/** Neutralise la surcharge du spike pour revenir au layout d'origine. */
const RESTAURER_GRILLE = `
  .table-body { display: grid !important; grid-template-columns: 288px 1fr 324px !important;
                position: static !important; inset: auto !important; }
  .map-area { position: static !important; inset: auto !important;
              display: flex !important; flex-direction: column !important; }
  .map-frame { position: relative !important; inset: auto !important;
               margin: 14px !important; flex: 1 !important; }
  .map-header, .combat-bandeau { position: static !important; inset: auto !important;
                                z-index: auto !important; }
  .mj-toolbar { position: static !important; inset: auto !important; z-index: auto !important; }
  .compagnie, .panel { position: static !important; top: auto !important; bottom: auto !important;
                       left: auto !important; right: auto !important; z-index: auto !important;
                       width: auto !important; border: 0 !important; border-radius: 0 !important;
                       box-shadow: none !important; }
`;

/**
 * Fonction evaluee DANS la page. Reproduit drawFogBase().
 * Recoit un objet unique, Playwright n'acceptant qu'un argument.
 */
function mesurerDansLaPage(o) {
  const w = o.w;
  const h = o.h;
  const fogScale = o.fs;
  const reveals = o.reveals;
  const reps = o.reps;

  const c = document.createElement("canvas");
  c.width = Math.round(w * fogScale);
  c.height = Math.round(h * fogScale);
  const ctx = c.getContext("2d");

  const fois = [];
  let traits = 0;

  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();

    ctx.setTransform(fogScale, 0, 0, fogScale, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#3B372E";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(251,248,240,.05)";
    ctx.lineWidth = 1;
    let n = 0;
    for (let i = -h; i < w; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
      n++;
    }
    traits = n;

    if (reveals && reveals.length) {
      ctx.globalCompositeOperation = "destination-out";
      for (const p of reveals) {
        const px = (p.x / 100) * w;
        const py = (p.y / 100) * h;
        const rad = 68;
        const g = ctx.createRadialGradient(px, py, rad * 0.35, px, py, rad);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Les commandes canvas 2D sont mises en file : sans une lecture de
    // pixels, on ne chronometre que la soumission, pas la rasterisation.
    // Un getImageData(1x1) force le flush et rend la mesure honnete.
    ctx.getImageData(0, 0, 1, 1);

    fois.push(performance.now() - t0);
  }

  fois.sort((a, b) => a - b);
  return {
    medianMs: fois[Math.floor(fois.length / 2)],
    minMs: fois[0],
    maxMs: fois[fois.length - 1],
    traits: traits,
    backingStore: c.width + "x" + c.height,
    octets: c.width * c.height * 4,
    megaPixels: (c.width * c.height) / 1e6,
  };
}

async function mesurer(page, label) {
  const dims = await page.evaluate(() => {
    const surf = document.querySelector(".map-surface");
    const frame = document.querySelector(".map-frame");
    const fog = document.querySelector("canvas.fog-canvas");
    if (!surf) return null;
    return {
      viewport: [innerWidth, innerHeight],
      dpr: window.devicePixelRatio,
      frameLayout: frame ? [frame.offsetWidth, frame.offsetHeight] : null,
      surfaceLayout: [surf.offsetWidth, surf.offsetHeight],
      fogCanvas: fog ? [fog.width, fog.height] : null,
    };
  });

  if (!dims) {
    console.log("\n  " + label + " : pas de surface, rien a mesurer");
    return null;
  }

  const w = dims.surfaceLayout[0];
  const h = dims.surfaceLayout[1];
  const dpr = dims.dpr || 1;
  const lignes = [];

  for (const zoom of [1, 2, 3]) {
    // fogScale = min(3, max(1, zoom * dpr)) — la formule exacte du produit
    const fogScale = Math.min(3, Math.max(1, zoom * dpr));
    const r = await page.evaluate(mesurerDansLaPage, {
      w: w,
      h: h,
      fs: fogScale,
      reveals: [
        { x: 30, y: 30 },
        { x: 55, y: 45 },
        { x: 70, y: 62 },
      ],
      reps: 7,
    });
    lignes.push({ zoom: zoom, fogScale: fogScale, ...r });
  }

  console.log("\n  " + label);
  console.log("    viewport " + JSON.stringify(dims.viewport) + "   dpr " + dims.dpr);
  console.log("    map-frame   mise en page " + JSON.stringify(dims.frameLayout));
  console.log("    map-surface mise en page " + JSON.stringify(dims.surfaceLayout));
  console.log("    fog-canvas reel         " + JSON.stringify(dims.fogCanvas));
  console.log(
    "     zoom | fogScale | backing store |   Mpx | memoire |  traits | mediane |  min  |  max",
  );
  for (const l of lignes) {
    console.log(
      "    " +
        String(l.zoom) +
        "x | " +
        l.fogScale.toFixed(2).padStart(9) +
        " | " +
        l.backingStore.padEnd(13) +
        " | " +
        l.megaPixels.toFixed(2).padStart(5) +
        " | " +
        (l.octets / 1048576).toFixed(1).padStart(6) +
        " Mo | " +
        String(l.traits).padStart(7) +
        " | " +
        l.medianMs.toFixed(1).padStart(7) +
        " | " +
        l.minMs.toFixed(1).padStart(5) +
        " | " +
        l.maxMs.toFixed(1).padStart(5),
    );
  }
  return { dims, lignes };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.request.post(BASE + "/api/dev/seed", { data: { reset: true } });
  await page.request.post(BASE + "/api/dev/login", { data: { user: "mj" } });
  await page.goto(BASE + "/campaigns/dev-camp/table");
  await page.getByRole("button", { name: "Journal" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Cartes" }).click({ force: true });
  await page.getByRole("button", { name: /Carte illustrée/ }).click({ force: true });
  await page.locator(".map-surface").waitFor({ timeout: 10000 });
  await page.waitForTimeout(900);

  // Le canvas de brouillard n'existe que si l'outil est actif.
  const fogBtn = page.getByRole("button", { name: "Brouillard" });
  if (await fogBtn.count()) {
    await fogBtn.first().click({ force: true });
    await page.waitForTimeout(700);
  }
  console.log("canvas de brouillard present :", await page.locator("canvas.fog-canvas").count());

  // On veut le coût sur un téléphone, pas sur un Mac de 2026.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  console.log("CPU ralenti x4. drawFogBase() reproduit a l identique, mediane sur 7 repetitions.");
  console.log("fogScale = min(3, max(1, zoom x devicePixelRatio)) — la formule du produit.");

  const plein = await mesurer(page, "LAYOUT PLEIN ECRAN (le spike)");

  await page.addStyleTag({ content: RESTAURER_GRILLE });
  await page.waitForTimeout(1000);
  const grille = await mesurer(page, "LAYOUT GRILLE (l actuel)");

  console.log("\n================ RAPPORT ================");
  if (plein && grille) {
    const pa = plein.lignes;
    const ga = grille.lignes;
    const mo = (o) => (o / 1048576).toFixed(1) + " Mo";
    console.log(
      "surface (mise en page)  grille " +
        JSON.stringify(grille.dims.surfaceLayout) +
        "   ->   plein ecran " +
        JSON.stringify(plein.dims.surfaceLayout),
    );
    console.log("");
    console.log("zoom | memoire grille -> plein | x      | mediane grille -> plein | x");
    for (let i = 0; i < 3; i++) {
      console.log(
        "  " +
          pa[i].zoom +
          "x | " +
          mo(ga[i].octets).padStart(9) +
          " -> " +
          mo(pa[i].octets).padEnd(9) +
          " | x" +
          (pa[i].octets / ga[i].octets).toFixed(2).padStart(5) +
          " | " +
          ga[i].medianMs.toFixed(1).padStart(15) +
          " -> " +
          pa[i].medianMs.toFixed(1).padEnd(8) +
          " | x" +
          (pa[i].medianMs / ga[i].medianMs).toFixed(2),
      );
    }
    console.log("");
    console.log(
      "traits de hachure par repeint : grille " + ga[0].traits + " -> plein " + pa[0].traits,
    );
    console.log("surface a l ecran (plein)    : " + JSON.stringify(plein.dims.frameLayout));
  }

  await browser.close();
})();
