import { expect, type APIRequestContext, type Page } from "@playwright/test";
import zlib from "node:zlib";

export const CAMPAIGN = "dev-camp";

/** Identifiants produits par POST /api/dev/seed. */
export const MJ = "mj";
export const KAELITH = "kaelith";
export const RAGNAR = "ragnar";

/** Id de la carte illustrée du seed (celle qui porte l'image). */
export const MAP_IMAGE = "map-image";

/**
 * Re-seed la fixture déterministe, en purgeant au passage l'état du Durable
 * Object (journal, carte active, pions) — sans ça l'état survit d'un run à
 * l'autre et les tests deviennent ordonnés-par-hasard.
 *
 * `reset: false` pour les specs qui ne touchent PAS à la table (le compendium,
 * par exemple) : le purge est un effet de bord global, et il entrerait en
 * collision avec une table ouverte dans un autre worker. L'upsert des users,
 * de la campagne et des maps reste idempotent, donc la fixture est tout aussi
 * disponible.
 */
export async function seed(request: APIRequestContext, { reset = true } = {}) {
  const res = await request.post("/api/dev/seed", { data: { reset } });
  expect(res.ok(), "seed dev : la variable DEV_AUTH=1 doit être dans .dev.vars").toBeTruthy();
  return res.json();
}

/** Pose le cookie du bypass d'auth pour un utilisateur dev. */
export async function login(page: Page, user: string) {
  // Le tutoriel MJ s'ouvre une fois par navigateur : les tests le marquent vu
  // via un script d'init (le test dédié utilise un contexte sans ce script).
  await page.addInitScript(() => {
    try {
      localStorage.setItem("hd-tutoriel-mj", "1");
    } catch {
      /* ignore */
    }
  });
  const res = await page.request.post("/api/dev/login", { data: { user } });
  expect(res.ok()).toBeTruthy();
}

/** Connecte, seed, et ouvre la table de la campagne. */
export async function openTable(page: Page, user: string) {
  await seed(page.request);
  await login(page, user);
  await page.goto(`/campaigns/${CAMPAIGN}/table`);
  // On attend un élément présent pour TOUT le monde (la fenêtre Journal,
  // ouverte par défaut) : la barre d'outils n'existe que pour le MJ.
  await expect(page.locator(".journal-panel")).toBeVisible();
}

/** Ouvre une fenêtre par son raccourci (J / D / I). */
export async function openPanel(page: Page, kind: "journal" | "dice" | "inventory") {
  const key = kind === "journal" ? "j" : kind === "dice" ? "d" : "i";
  await page.keyboard.press(key);
  const cls = kind === "inventory" ? "inv-panel" : `${kind}-panel`;
  await expect(page.locator(`.${cls}`)).toBeVisible();
  if (kind === "inventory") {
    // Le titre « Sac de … » attend le snapshot WS : sans ça, une action du MJ
    // partirait sans cible et serait ignorée.
    await expect(page.locator(".inv-panel .panel-title")).not.toHaveText(/…/);
  }
}

/** Le store WS est-il connecté (pastille / titre de session) ? */
export async function waitConnected(page: Page) {
  await expect(page.getByText(/Mode exploration|Tour suivant|à vos d20/)).toBeVisible();
}

/** Place un personnage depuis la bibliothèque (double-clic = poser). */
export async function placeFromLibrary(page: Page, tab: "Personnages" | "PNJ", name: string) {
  await page.getByRole("button", { name: "Bibliothèque" }).click();
  const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
  await dialog.getByRole("tab", { name: new RegExp(tab) }).click();
  await dialog.locator(".asset-card", { hasText: name }).first().dblclick();
  await expect(page.locator(".token", { hasText: name }).first()).toBeVisible();
}

/** Place un PJ au double-clic sur son GroupFrame (MJ), carte déjà choisie. */
export async function placePjFromFrame(page: Page, name: string) {
  await page.locator(".gf", { hasText: name }).first().dblclick();
  await expect(page.locator(".token", { hasText: name }).first()).toBeVisible();
}

/** Sélectionne une carte depuis la bibliothèque (le panneau « Cartes » a été supprimé). */
export async function selectMap(page: Page, name: string) {
  await page.getByRole("button", { name: "Bibliothèque" }).click();
  const dialog = page.getByRole("dialog", { name: "Bibliothèque de la campagne" });
  await dialog.getByRole("tab", { name: /Cartes/ }).click();
  await dialog.locator(".asset-card", { hasText: name }).first().dblclick();
  // Attendre le démontage complet du portal (contenu ET scrim) et la fin du
  // verrou bits-ui : un clic droit immédiat serait sinon avalé.
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".asset-scrim")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  await expect(page.locator(".map-frame")).toHaveAttribute("data-map", name);
}

// ── PNG généré pour les tests (zlib + CRC32 maison, aucun binaire au dépôt) ──

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Image de test : dégradé + bande diagonale (le cadrage se voit à l'œil). */
export function makePng(w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const band = Math.abs(x - y) < 10;
      raw[o] = band ? 220 : Math.round((x / w) * 200);
      raw[o + 1] = band ? 60 : Math.round((y / h) * 200);
      raw[o + 2] = band ? 40 : 120;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
