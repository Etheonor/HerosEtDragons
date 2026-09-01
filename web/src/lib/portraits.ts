// Portraits : fichiers statiques générés par tools/portraits/build.mjs.
// La feuille ne stocke que la clé "<Race>/<CODE>" ; l'URL est dérivée ici,
// et le manifest sert uniquement au sélecteur.

export interface PortraitEntry {
  key: string;
  race: string;
  code: string;
}

const KEY_RE = /^[\w -]{1,40}\/[\w-]{1,40}$/;

export function isPortraitKey(v: unknown): v is string {
  return typeof v === "string" && KEY_RE.test(v);
}

export function portraitUrl(key: string | null | undefined): string | null {
  if (!isPortraitKey(key)) return null;
  const [race, code] = key.split("/");
  return `/portraits/${encodeURIComponent(race as string)}/${encodeURIComponent(code as string)}.webp`;
}

let cached: PortraitEntry[] | null = null;
let inflight: Promise<PortraitEntry[]> | null = null;

export function loadPortraits(): Promise<PortraitEntry[]> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/portraits/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("manifest"))))
      .then((data: { portraits: PortraitEntry[] }) => {
        cached = data.portraits ?? [];
        return cached;
      })
      .catch(() => {
        cached = [];
        return cached;
      });
  }
  return inflight;
}

export function portraitsByRace(
  entries: PortraitEntry[],
): { race: string; items: PortraitEntry[] }[] {
  const map = new Map<string, PortraitEntry[]>();
  for (const e of entries) {
    const list = map.get(e.race) ?? [];
    list.push(e);
    map.set(e.race, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "fr"))
    .map(([race, items]) => ({ race, items }));
}
