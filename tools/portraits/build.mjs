// Génère les portraits web (WebP 128px) + manifest.json à partir de ./portraits.
// Source : portraits/<Race>/<CODE>.bmp   →   web/static/portraits/<Race>/<CODE>.webp
// Clé stockée en base : "<Race>/<CODE>" (sans extension).
//
// OUTIL LOCAL : les .bmp ne sont pas lisibles par les binaires précompilés de
// sharp/libvips (ni donc par la CI Cloudflare) → conversion BMP→PNG via sips
// (macOS) en repli, puis redimensionnement WebP via sharp. Le résultat est
// COMMIS dans web/static/portraits : le build/deploy se contente de le servir.
import sharp from "sharp";
import { promises as fs } from "fs";
import { execFile } from "child_process";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { promisify } from "util";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "portraits");
const OUT = path.join(ROOT, "web/static/portraits");
const SIZE = 128;

async function ensureDir(d) {
  await fs.mkdir(d, { recursive: true });
}

async function convert(srcFile, destFile) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "portraits-"));
  try {
    let input = srcFile;
    try {
      await sharp(srcFile, { failOn: "none" }).metadata();
    } catch {
      // format non supporté par sharp (bmp) → sips le convertit en png
      if (process.platform !== "darwin") {
        throw new Error("sharp ne sait pas lire ce format et le repli sips n'existe que sur macOS");
      }
      const png = path.join(tmpDir, "conv.png");
      await exec("sips", ["-s", "format", "png", srcFile, "--out", png]);
      input = png;
    }
    await sharp(input, { failOn: "none" })
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toFile(destFile);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  if (!(await fs.stat(SRC).catch(() => null))) {
    console.error(`[portraits] dossier source absent : ${SRC}`);
    process.exit(1);
  }
  await ensureDir(OUT);
  const races = (await fs.readdir(SRC, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const manifest = [];
  let converted = 0;
  let foundSources = 0;
  let failed = 0;
  for (const race of races) {
    const files = (await fs.readdir(path.join(SRC, race)))
      .filter((f) => /\.(bmp|png|jpe?g|webp)$/i.test(f))
      .sort();
    const destDir = path.join(OUT, race);
    await ensureDir(destDir);
    foundSources += files.length;
    for (const file of files) {
      const code = path.basename(file).replace(/\.[^.]+$/, "");
      const key = `${race}/${code}`;
      const destFile = path.join(destDir, `${code}.webp`);
      const [destStat, srcStat] = await Promise.all([
        fs.stat(destFile).catch(() => null),
        fs.stat(path.join(SRC, race, file)),
      ]);
      if (destStat && destStat.mtimeMs > srcStat.mtimeMs) {
        manifest.push({ key, race, code });
        continue;
      }
      try {
        await convert(path.join(SRC, race, file), destFile);
        converted++;
      } catch (e) {
        failed++;
        console.error(`[portraits] échec ${key} : ${e.message}`);
        continue;
      }
      manifest.push({ key, race, code });
    }
  }
  // Fusion : les webp déjà présents dans la sortie (sources locales retirées
  // du dépôt) restent référencés au manifest — on n'ajoute que ce qui est
  // manquant ; pour retirer un portrait, supprimer son .webp.
  const seen = new Set(manifest.map((m) => m.key));
  for (const race of await fs.readdir(OUT, { withFileTypes: true }).catch(() => [])) {
    if (!race.isDirectory()) continue;
    const webps = await fs.readdir(path.join(OUT, race.name)).catch(() => []);
    for (const f of webps) {
      if (!f.endsWith(".webp")) continue;
      const code = f.replace(/\.webp$/, "");
      const key = `${race.name}/${code}`;
      if (!seen.has(key)) {
        seen.add(key);
        manifest.push({ key, race: race.name, code });
      }
    }
  }
  if (foundSources === 0) {
    console.log(
      "[portraits] aucune source dans portraits/ (dossier local hors dépôt) — manifest reconstruit depuis les webp existants.",
    );
  }
  manifest.sort((a, b) => a.key.localeCompare(b.key, "fr"));
  await fs.writeFile(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ count: manifest.length, portraits: manifest }, null, 1),
  );
  console.log(
    `[portraits] ${manifest.length} entrées (${converted} conversions, ${failed} échecs) → ${path.relative(ROOT, OUT)}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
