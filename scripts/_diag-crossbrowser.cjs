/*
 * Meme balayage sur Firefox et WebKit (Safari) : le top layer se comporte
 * différemment selon les moteurs, c'est justement ce que la campagne Chromium
 * ne peut pas montrer.
 */
const pw = require('@playwright/test');

const URL = 'http://localhost:5173/dev/overlays';
const ZOOMS = [1, 2, 3];
const TESTS = [
  { id: 'T1', expect: 'ok', sel: '.chrome-bar .tbtn', right: false },
  { id: 'T2', expect: 'ok', sel: '[data-anchor="t2"]', right: false },
  { id: 'T3', expect: 'ok', sel: '[data-anchor="t3"]', right: false },
  { id: 'T4', expect: 'ok', sel: '[data-anchor="t4"]', right: false },
  { id: 'T5', expect: 'ok', sel: '[data-anchor="t5"]', right: true },
  { id: 'T6', expect: 'ko', sel: '[data-anchor="t6"]', right: false },
];

async function sweep(launcher, name) {
  const browser = await launcher.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('.map-bg', { timeout: 10000 });

  let bad = 0;
  let total = 0;
  const lines = [];

  for (const z of ZOOMS) {
    await page.locator('.zbtn', { hasText: `${z}×` }).first().click();
    const box = await page.locator('.map-bg').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();

    for (const t of TESTS) {
      total += 1;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      try {
        await page
          .locator(t.sel)
          .first()
          .click({ button: t.right ? 'right' : 'left', timeout: 3000, force: true });
      } catch {
        lines.push(`  ECHEC  ${z}x  ${t.id}  declencheur muet`);
        bad += 1;
        continue;
      }
      await page.waitForTimeout(400);
      const r = (await page.locator('.report').innerText().catch(() => '')).trim();
      if (r.includes('conforme')) {
        const taille = (r.match(/(\d+) \/ (\d+) px/) || []).slice(1).join('/');
        lines.push(`  ok     ${z}x  ${t.id}  (${taille || 'menu'})`);
      } else {
        bad += 1;
        lines.push(`  ECHEC  ${z}x  ${t.id}`);
        lines.push(
          '    ' +
            r
              .split('\n')
              .slice(0, 6)
              .join('\n    ')
        );
      }
    }
  }

  console.log(`\n===== ${name} : ${total - bad}/${total} =====`);
  console.log(lines.join('\n'));
  if (errors.length) console.log('  erreurs de page : ' + errors.slice(0, 5).join(' | '));

  await browser.close();
  return bad;
}

(async () => {
  let bad = 0;
  bad += await sweep(pw.chromium, 'Chromium');
  bad += await sweep(pw.firefox, 'Firefox');
  bad += await sweep(pw.webkit, 'WebKit / Safari');
  console.log(bad === 0 ? '\nTOUT EST CONFORME sur les trois moteurs' : `\n${bad} echec(s) au total`);
  process.exit(bad === 0 ? 0 : 1);
})();