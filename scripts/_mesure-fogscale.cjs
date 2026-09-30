/*
 * Combien coûte CHAQUE valeur de fogScale au pire cas desktop ?
 *
 * Cible : PC fixe, grand ecran, souvent Retina. Le pire cas mesure est
 * 2560x1440 dpr 2, ou fogScale = zoom x dpr plafonne a 3 des le zoom 1.
 *
 *   node scripts/_mesure-fogscale.cjs
 */
const { chromium, devices } = require("@playwright/test");

const BASE = "http://localhost:8787";

function mesurer(o) {
  const w = o.w;
  const h = o.h;
  const fogScale = o.fs;
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
    ctx.getImageData(0, 0, 1, 1);
    fois.push(performance.now() - t0);
  }
  fois.sort((a, b) => a - b);
  return {
    medianMs: fois[Math.floor(fois.length / 2)],
    maxMs: fois[fois.length - 1],
    mpx: (c.width * c.height) / 1e6,
    mo: (c.width * c.height * 4) / 1048576,
    traits: traits,
  };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"] });
  const page = await ctx.newPage();

  await page.request.post(BASE + "/api/dev/seed", { data: { reset: true } });
  await page.request.post(BASE + "/api/dev/login", { data: { user: "mj" } });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const CAS = [
    { nom: "2560x1440  dpr 2", w: 2560, h: 1440, dpr: 2 },
    { nom: "2560x1440  dpr 1", w: 2560, h: 1440, dpr: 1 },
    { nom: "1920x1080  dpr 1", w: 1920, h: 1080, dpr: 1 },
  ];

  console.log("CPU ralenti x4. Budget d image a 60 Hz = 16,7 ms.\n");

  for (const c of CAS) {
    await page.setViewportSize({ width: c.w, height: c.h });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: c.w,
      height: c.h,
      deviceScaleFactor: c.dpr,
      mobile: false,
    });
    await page.goto(BASE + "/campaigns/dev-camp/table");
    await page.getByRole("button", { name: "Journal" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Cartes" }).click({ force: true });
    await page.getByRole("button", { name: /Carte illustrée/ }).click({ force: true });
    await page.locator(".map-surface").waitFor({ timeout: 10000 });
    await page.waitForTimeout(900);

    const sw = await page.evaluate(() => [
      document.querySelector(".map-surface").offsetWidth,
      document.querySelector(".map-surface").offsetHeight,
    ]);

    console.log(
      c.nom + "   surface " + sw.join("x") + "   (" + ((sw[0] * sw[1]) / 1e6).toFixed(2) + " Mpx)",
    );
    console.log(
      "  fogScale | backing store |   Mpx | memoire | traits | mediane |    max | vs budget image",
    );
    for (const fs of [1, 1.5, 2, 3]) {
      const r = await page.evaluate(mesurer, { w: sw[0], h: sw[1], fs: fs, reps: 7 });
      const budget = r.medianMs / 16.7;
      console.log(
        "  " +
          fs.toFixed(1).padStart(9) +
          " | " +
          Math.round(sw[0] * fs) +
          "x" +
          Math.round(sw[1] * fs) +
          "".padEnd(3) +
          " | " +
          r.mpx.toFixed(2).padStart(5) +
          " | " +
          r.mo.toFixed(1).padStart(6) +
          " Mo | " +
          String(r.traits).padStart(6) +
          " | " +
          r.medianMs.toFixed(1).padStart(7) +
          " | " +
          r.maxMs.toFixed(1).padStart(6) +
          " | x" +
          budget.toFixed(1),
      );
    }
    console.log("");
  }

  await browser.close();
})();
