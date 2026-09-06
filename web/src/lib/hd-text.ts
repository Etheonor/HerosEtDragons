// Libellés dérivés des tables races/classes (hd.ts) — partagés UI création/feuille.
// Source unique des libellés de caractéristiques (D2) : la feuille et l'assistant
// importent d'ici, plus aucune copie locale.
import type { Carac, RaceInfo, ClassInfo } from "@rollwith/shared/hd";

/** Libellés courts (bonus raciaux, badges). */
export const CARAC_LABELS_SHORT: Record<Carac, string> = {
  for: "Force",
  dex: "Dex",
  con: "Const",
  int: "Int",
  sag: "Sag",
  cha: "Charism",
};

/** Noms complets (sauvegardes, assistant). */
export const CARAC_NAMES: Record<Carac, string> = {
  for: "Force",
  dex: "Dextérité",
  con: "Constitution",
  int: "Intelligence",
  sag: "Sagesse",
  cha: "Charisme",
};

export function bonusRacialText(r: RaceInfo): string {
  const parts: string[] = [];
  if (r.bonus.all) parts.push(`+${r.bonus.all} partout`);
  for (const [k, v] of Object.entries(r.bonus.fixed ?? {})) {
    parts.push(`${CARAC_LABELS_SHORT[k as Carac]} +${v}`);
  }
  if (r.bonus.free) parts.push(`+${r.bonus.free.value} ×${r.bonus.free.count} au choix`);
  return parts.join(" · ");
}

export function classSummary(c: ClassInfo): string {
  const saves = c.saves.map((x) => x.toUpperCase()).join(", ");
  const cast = c.casting ? ` · inc ${c.casting.toUpperCase()}` : "";
  return `DV d${c.hitDie} · sauves ${saves}${cast}`;
}
