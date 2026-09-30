/*
 * Validation du spike /dev/overlays — jetable, à supprimer avec la route.
 *
 * Pilote la page et vérifie que chaque test affiche « conforme » :
 *   · T1, T2, T3 (hors carte)      → aucun échec attendu
 *   · T4, T5 (dans la carte)        → aucun échec attendu
 *   · T6 (sans Portal ni strategy)  → au moins un échec attendu
 *
 * Refait la passe pour chaque zoom, avec un panoramique appliqué : le
 * comportement ne doit pas dépendre du niveau de zoom ni de la position.
 *
 *   node scripts/_diag-spike.cjs
 */
const { chromium } = require("@playwright/test");

const URL = "http://localhost:5173/dev/overlays";
const ZOOMS = [1, 1.5, 2, 3];

const TESTS = [
  { id: "T1", label: "T1 · Dialog", expect: "ok", kind: "click", sel: null },
  { id: "T2", label: "T2 · Popover", expect: "ok", kind: "click", sel: '[data-anchor="t2"]' },
  { id: "T3", label: "T3 · popover natif", expect: "ok", kind: "click", sel: '[data-anchor="t3"]' },
  { id: "T4", label: "T4 · Popover", expect: "ok", kind: "click", sel: '[data-anchor="t4"]' },
  { id: "T5", label: "T5 · ContextMenu", expect: "ok", kind: "right", sel: '[data-anchor="t5"]' },
  { id: "T6", label: "T6 · sans Portal", expect: "ko", kind: "click", sel: '[data-anchor="t6"]' },
];

async function setZoom(page, z) {
  await page
    .locator(".zbtn", { hasText: `${z}×` })
    .first()
    .click();
}

async function pan(page, dx, dy) {
  const box = await page.locator(".map-bg").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("[console] " + m.text());
  });

  await page.goto(URL, { waitUntil: "networkidle" });

  let total = 0;
  let bad = 0;

  for (const z of ZOOMS) {
    await setZoom(page, z);
    await pan(page, 60, 40);

    for (const t of TESTS) {
      total += 1;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);

      const target = t.sel ? page.locator(t.sel) : page.locator(".chrome-bar .tbtn").first();
      try {
        await target.click({
          button: t.kind === "right" ? "right" : "left",
          timeout: 3000,
          force: true,
        });
      } catch {
        console.log(`  ECHEC  zoom ${z}x  ${t.id} : le declencheur n'a pas repondu`);
        bad += 1;
        continue;
      }

      await page.waitForTimeout(350);
      const report = (
        await page
          .locator(".report")
          .innerText()
          .catch(() => "")
      ).trim();
      const conforme = report.includes("conforme");
      const inattendu = report.includes("inattendu");

      // le rapport doit correspondre au test attendu
      const attenduVisible = t.expect === "ko" ? "au moins un échec" : "aucun échec";
      const coherent = rapport_contient(report, attenduVisible);

      if (conforme && !inattendu && coherent) {
        const taille = (report.match(/(\d+) \/ (\d+) px/) || []).slice(1).join(" / ");
        console.log(`  ok     zoom ${z}x  ${t.id}  conforme  (${taille || "menu"})`);
      } else {
        bad += 1;
        console.log(`  ECHEC  zoom ${z}x  ${t.id}  (attendu : ${t.expect})`);
        console.log("    " + report.split("\n").join("\n    "));
      }
    }
  }

  console.log(`\n${total - bad}/${total} conformes`);
  if (errors.length) {
    console.log("\nErreurs de page :");
    console.log(errors.slice(0, 10).join("\n"));
  }

  await browser.close();
  process.exit(bad === 0 ? 0 : 1);

  function rapport_contient(r, attendu) {
    return r.includes("Attendu pour ce test : " + attendu);
  }
})();
