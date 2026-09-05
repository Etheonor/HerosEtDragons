// Libellés dérivés des tables races/classes (hd.ts) — partagés UI création/feuille.
import type { Carac, RaceInfo, ClassInfo } from "@rollwith/shared/hd";

const LABELS: Record<Carac, string> = {
  for: "Force",
  dex: "Dex",
  con: "Const",
  int: "Int",
  sag: "Sag",
  cha: "Charism",
};

export function bonusRacialText(r: RaceInfo): string {
  const parts: string[] = [];
  if (r.bonus.all) parts.push(`+${r.bonus.all} partout`);
  for (const [k, v] of Object.entries(r.bonus.fixed ?? {})) {
    parts.push(`${LABELS[k as Carac]} +${v}`);
  }
  if (r.bonus.free) parts.push(`+${r.bonus.free.value} ×${r.bonus.free.count} au choix`);
  return parts.join(" · ");
}

export function classSummary(c: ClassInfo): string {
  const saves = c.saves.map((x) => x.toUpperCase()).join(", ");
  const cast = c.casting ? ` · inc ${c.casting.toUpperCase()}` : "";
  return `DV d${c.hitDie} · sauves ${saves}${cast}`;
}
