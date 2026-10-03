/* Session de perf locale : mesure le zoom/pan de la table et le scroll du
 * compendium (rAF, long tasks, long animation frames, métriques CDP).
 * Usage : node scripts/_perf-session.cjs [map|compendium|all] */
const { chromium } = require("@playwright/test");

const URL = process.env.URL || "http://localhost:8787";
const CAMPAIGN = "dev-camp";
const W = Number(process.env.W || 1920);
const H = Number(process.env.H || 1080);

const INSTRUMENT = () => {
  window.__perf = { frames: [], long: [], loaf: [], marks: [] };
  let last = performance.now();
  const tick = (now) => {
    window.__perf.frames.push({ t: now, d: now - last });
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__perf.long.push({ start: e.startTime, dur: e.duration });
    }).observe({ entryTypes: ["longtask"] });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.loaf.push({
          start: e.startTime,
          dur: e.duration,
          blocking: e.blockingDuration,
          scripts: (e.scripts || []).map((s) => ({
            name: s.sourceFunctionName,
            url: (s.sourceURL || "").split("/").pop(),
            dur: +s.duration.toFixed(1),
          })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch (err) {
    window.__perf.loafErr = String(err);
  }
};

const COLLECT = () => {
  const p = window.__perf;
  const marks = Object.fromEntries(p.marks.map((m) => [m.label, m.t]));
  const stats = (a, b) => {
    const ds = p.frames.filter((f) => f.t >= a && f.t <= b).map((f) => f.d);
    if (!ds.length) return null;
    const sorted = [...ds].sort((x, y) => x - y);
    const sum = ds.reduce((s, v) => s + v, 0);
    const q = (v) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * v))];
    return {
      n: ds.length,
      avg: +(sum / ds.length).toFixed(1),
      p50: +q(0.5).toFixed(1),
      p95: +q(0.95).toFixed(1),
      max: +sorted[sorted.length - 1].toFixed(1),
      over20: ds.filter((d) => d > 20).length,
      over33: ds.filter((d) => d > 33).length,
      over50: ds.filter((d) => d > 50).length,
      fps: +(1000 / (sum / ds.length)).toFixed(1),
    };
  };
  const inRange = (e, a, b) => e.start >= a && e.start <= b;
  const out = { ranges: {} };
  const pairs = Object.keys(marks)
    .filter((k) => k.endsWith("-start"))
    .map((k) => [k.replace("-start", ""), marks[k], marks[k.replace("-start", "-end")]]);
  for (const [name, a, b] of pairs) {
    out.ranges[name] = stats(a, b);
    out[`long:${name}`] = p.long.filter((e) => inRange(e, a, b));
    out[`loaf:${name}`] = p.loaf.filter((e) => inRange(e, a, b));
  }
  out.loafErr = p.loafErr;
  return out;
};

async function snap(page, label) {
  return page.evaluate((label) => {
    const t = performance.now();
    window.__perf.marks.push({ label, t });
    return t;
  }, label);
}

async function metrics(page, cdp) {
  const m = (await cdp.send("Performance.getMetrics")).metrics;
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}

async function diffMetrics(page, cdp, keys) {
  const before = await metrics(page, cdp);
  return async () => {
    const after = await metrics(page, cdp);
    return Object.fromEntries(
      keys.map((k) => [k, +(((after[k] ?? 0) - (before[k] ?? 0)) * 1000).toFixed(1)]),
    );
  };
}

async function openTable(page) {
  await page.request.post(`${URL}/api/dev/seed`, { data: { reset: true } });
  await page.request.post(`${URL}/api/dev/login`, { data: { user: "mj" } });
  await page.goto(`${URL}/campaigns/${CAMPAIGN}/table`);
  await page.locator(".journal-panel").waitFor();
  const skip = page.getByRole("button", { name: "Passer" });
  await skip.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  if (await skip.count()) await skip.click();
  await page.getByRole("button", { name: "Bibliothèque" }).click();
  const dlg = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
  await dlg.getByRole("tab", { name: /Cartes/ }).click();
  await dlg.locator(".asset-card", { hasText: "Carte illustrée" }).dblclick();
  await page.waitForTimeout(700);
  await page.locator(".gf", { hasText: "Kaelith" }).first().dblclick();
  await page.getByRole("button", { name: "Bibliothèque" }).click();
  const dlg2 = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
  await dlg2.getByRole("tab", { name: /PNJ/ }).click();
  await dlg2.locator(".asset-card", { hasText: "Gobelin" }).first().dblclick();
  await page.locator(".gf", { hasText: "Ragnar" }).first().dblclick();
  await page.waitForTimeout(500);
  if (process.env.FOG) {
    await page.getByRole("button", { name: "Brouillard", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

async function runMap(browser) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: Number(process.env.DSF || 1),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await openTable(page);
  await page.evaluate(INSTRUMENT);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const done = await diffMetrics(page, cdp, [
    "TaskDuration",
    "ScriptDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "LayoutCount",
    "RecalcStyleCount",
  ]);

  const box = await page.locator(".map-frame").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);

  let traceEvents = null;
  if (process.env.TRACE) {
    traceEvents = [];
    cdp.on("Tracing.dataCollected", (ev) => {
      if (ev.value) traceEvents.push(...ev.value);
    });
    await cdp.send("Tracing.start", {
      categories: "devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline",
      transferMode: "ReportEvents",
    });
  }

  await snap(page, "zoom-start");
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, -30);
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 30);
      await page.waitForTimeout(20);
    }
  }
  await snap(page, "zoom-end");

  if (traceEvents) {
    const doneTrace = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    await doneTrace;
    require("fs").writeFileSync("/tmp/perf-trace.json", JSON.stringify({ traceEvents }));
    console.log("trace: /tmp/perf-trace.json", traceEvents.length, "events");
  }

  await snap(page, "pan-start");
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  for (let i = 0; i < 36; i++) {
    await page.mouse.move(cx - i * 14, cy - i * 7, { steps: 2 });
  }
  await page.mouse.up({ button: "right" });
  await snap(page, "pan-end");
  await page.waitForTimeout(400);

  const result = await page.evaluate(COLLECT);
  console.log(JSON.stringify({ map: result, cdpMs: await done(), errors }, null, 2));
  await ctx.close();
}

async function runCompendium(browser) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: Number(process.env.DSF || 1),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await openTable(page);
  await page.getByRole("button", { name: "Command palette (Espace)" }).click();
  await page.locator(".palette-item", { hasText: "Ouvrir le compendium" }).click();
  await page.locator(".comp .list .row").first().waitFor();
  const chosen = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".comp .rail-item")];
    let best = 0;
    let bestI = 0;
    items.forEach((el, i) => {
      const n = Number(el.querySelector(".rail-count")?.textContent || "0");
      if (n > best) {
        best = n;
        bestI = i;
      }
    });
    return { bestI, best };
  });
  await page.locator(".comp .rail-item").nth(chosen.bestI).click();
  await page.waitForTimeout(700);
  const list = page.locator(".comp .list");
  const box = await list.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await snap(page, "scroll-start");
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(20);
  }
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -320);
    await page.waitForTimeout(20);
  }
  await snap(page, "scroll-end");
  await page.waitForTimeout(300);

  const result = await page.evaluate(COLLECT);
  const rows = await page.locator(".comp .list .row").count();
  console.log(
    JSON.stringify(
      { compendium: { ...result, category: chosen, rows }, cdpMs: await done(), errors },
      null,
      2,
    ),
  );
  await ctx.close();
}

(async () => {
  const mode = process.argv[2] || "all";
  const browser = await chromium.launch();
  if (mode === "map" || mode === "all") await runMap(browser);
  if (mode === "compendium" || mode === "all") await runCompendium(browser);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
