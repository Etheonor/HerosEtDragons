import {
  abilityModifier,
  proficiencyBonus,
  passivePerception,
  spellSaveDc,
  spellAttackBonus,
  levelFromXp,
  xpThreshold,
  SKILLS,
  SKILL_CARAC,
  type Carac,
  type Skill,
} from "$shared/rules";
import { findClass, findRace, findSubrace, racialBonus } from "$shared/hd";
import { CARAC_NAMES } from "./hd-text";
import type { ArmorKind, CharacterSheet } from "./api";

export type CaracKey = "for" | "dex" | "con" | "int" | "sag" | "cha";

export const CARAC_LABELS: Record<CaracKey, string> = {
  for: "FOR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  sag: "SAG",
  cha: "CHA",
};

export { CARAC_NAMES };

/**
 * Détail du bonus racial appliqué automatiquement : breakdown sauvé sur la
 * fiche (création assistée / choix libres), sinon déduit des tables oficiais
 * (race + sous-race désignée ; les choix libres du demi-elfe comptent 0 tant
 * qu'ils ne sont pas désignés). Aucune action manuelle n'est requise pour le
 * calcul.
 */
export function racialBreakdown(sheet: CharacterSheet): Partial<Record<CaracKey, number>> {
  if (sheet.racial && Object.keys(sheet.racial).length) return sheet.racial;
  const r = findRace(sheet.identite?.race);
  if (!r) return {};
  const sub = findSubrace(sheet.identite?.sousRace, r.key);
  return racialBonus(r, [], sub) as Partial<Record<CaracKey, number>>;
}

export function effectiveCarac(sheet: CharacterSheet, carac: CaracKey): number {
  return sheet.caracs[carac] + (racialBreakdown(sheet)[carac] ?? 0);
}

/**
 * PV officiels H&D : niveau 1 = DV max + mod CON ; ensuite moyenne du DV
 * (moitié + 1) + mod CON par niveau, **minimum 1 PV par niveau** (règle
 * assumée — une CON très basse ne peut pas retirer des PV). null si la
 * classe n'est pas reconnue.
 */
export function suggestedPvMax(sheet: CharacterSheet): number | null {
  const c = findClass(sheet.identite?.classe);
  if (!c) return null;
  const con = abilityModifier(effectiveCarac(sheet, "con"));
  const level = Math.max(1, Math.min(20, sheet.identite?.niveau || 1));
  const avg = c.hitDie / 2 + 1;
  const perLevel = Math.max(1, avg + con);
  return Math.max(1, c.hitDie + con) + (level - 1) * perLevel;
}

/** Contribution Dex d'une catégorie d'armure (table DRS). */
function dexPart(kind: ArmorKind, dexMod: number): number {
  if (kind === "lourde") return 0;
  if (kind === "intermediaire") return Math.min(dexMod, 2);
  return dexMod; // légère : modificateur complet
}

/**
 * CA officielle DRS : une armure (ou 10 + mod Dex sans armure) + au plus un
 * bouclier (+2). Plusieurs armures équipées ne s'empilent pas → la meilleure
 * gagne ; plusieurs boucliers → un seul bonus. L'armure n'abaisse jamais en
 * dessous de la CA « à nu » (10 + Dex). Règle d'or : aucun bouton, le dérivé
 * suit (échappatoire manuelle : caAuto=false).
 */
export function suggestedCa(sheet: CharacterSheet): number {
  const dexMod = abilityModifier(effectiveCarac(sheet, "dex"));
  const naked = 10 + dexMod;
  const equipped = (sheet.armures ?? []).filter((a) => a.equipee);
  const worn = equipped.filter((a) => a.kind !== "bouclier");
  let base = naked;
  if (worn.length) {
    base = Math.max(base, ...worn.map((a) => a.ca + dexPart(a.kind, dexMod)));
  }
  const shieldBonus = equipped.some((a) => a.kind === "bouclier")
    ? Math.max(0, ...equipped.filter((a) => a.kind === "bouclier").map((a) => a.ca))
    : 0;
  return Math.max(0, base + shieldBonus);
}

/**
 * Migration des fiches antérieures aux sous-races : la sous-race était tapée
 * dans le champ race (« Gnome des Lacs »), et n'était donc jamais appliquée.
 * Renvoie la séparation à effectuer, ou null si rien à faire.
 *
 * Idempotent par construction : après séparation, `race` ne contient plus le nom
 * de la sous-race, `findSubrace` ne retrace plus rien, et une sous-race
 * volontairement retirée ne ressuscite pas.
 */
export function adoptedSubrace(sheet: CharacterSheet): { race: string; sousRace: string } | null {
  if (sheet.identite?.sousRace) return null;
  const race = findRace(sheet.identite?.race);
  if (!race) return null;
  const sub = findSubrace(sheet.identite?.race, race.key);
  if (!sub) return null;
  return { race: race.label, sousRace: sub.label };
}

/**
 * La CA est-elle en calcul automatique ?
 *
 * Absent ou `null` = automatique, exactement comme `pvAuto` : seule une valeur
 * `false` explicite fige la CA (bouton « manuel · auto ? »). L'inverse — absent
 * = manuel — laissait une CA figée pour toujours sur les fiches créées avant la
 * CA automatique, y compris après un changement de DEX ou d'armure : c'est
 * exactement le cas « CA 10 alors que la DEX vaut +2 » qui remontait.
 */
export function isCaAuto(sheet: CharacterSheet): boolean {
  return sheet.caAuto !== false;
}

/** Détail lisible du calcul de CA (infobulle du champ CA). */
export function caBreakdown(sheet: CharacterSheet): string {
  const dexMod = abilityModifier(effectiveCarac(sheet, "dex"));
  const naked = 10 + dexMod;
  const equipped = (sheet.armures ?? []).filter((a) => a.equipee);
  const worn = equipped.filter((a) => a.kind !== "bouclier");
  const hasShield = equipped.some((a) => a.kind === "bouclier");
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  let head: string;
  if (!worn.length) {
    head = `10 + Dex (${fmt(dexMod)}) = ${naked}`;
  } else {
    const chosen = worn.reduce((best, a) =>
      a.ca + dexPart(a.kind, dexMod) > best.ca + dexPart(best.kind, dexMod) ? a : best,
    );
    const d = dexPart(chosen.kind, dexMod);
    const dTxt = d > 0 ? ` + Dex ${fmt(d)}` : d < 0 ? ` + Dex (${fmt(d)})` : "";
    const armorCa = chosen.ca + d;
    head =
      armorCa >= naked
        ? `${chosen.name} ${chosen.ca}${dTxt} = ${armorCa}`
        : `${chosen.name} ${chosen.ca}${dTxt} = ${armorCa} · nu ${naked}`;
  }
  const total = suggestedCa(sheet);
  return hasShield ? `${head} · bouclier +2 = ${total}` : `${head} = ${total}`;
}

export function getMod(sheet: CharacterSheet, carac: CaracKey): number {
  return abilityModifier(effectiveCarac(sheet, carac));
}

export function getLevel(sheet: CharacterSheet): number {
  return sheet.identite.niveau;
}

export function getProficiency(sheet: CharacterSheet): number {
  return proficiencyBonus(getLevel(sheet));
}

export function getSaveBonus(sheet: CharacterSheet, carac: CaracKey): number {
  const proficient = sheet.saveProficiencies[carac];
  return abilityModifier(effectiveCarac(sheet, carac)) + (proficient ? getProficiency(sheet) : 0);
}

export function getSkillBonus(sheet: CharacterSheet, skill: Skill): number {
  const proficient = sheet.skillProficiencies[skill] ?? false;
  const carac = SKILL_CARAC[skill];
  return abilityModifier(effectiveCarac(sheet, carac)) + (proficient ? getProficiency(sheet) : 0);
}

export function getPassivePerception(sheet: CharacterSheet): number {
  const proficient = sheet.skillProficiencies["Perception"] ?? false;
  return passivePerception(effectiveCarac(sheet, "sag"), proficient, getLevel(sheet));
}

export function getInitiativeBonus(sheet: CharacterSheet): number {
  return getMod(sheet, "dex") + sheet.initiativeBonus;
}

export function getShowSpells(sheet: CharacterSheet): boolean {
  return sheet.sorts.caracIncantation !== null;
}

/**
 * Un sort du grimoire appartient-il à cette classe ?
 *
 * Le DRS regroupe des écoles sous un même jeton de `meta.classes` — les sorts
 * de l'ensorceleur ET de la sorcelame y sont étiquetés « Ensorceleur/Sorcelame ».
 * Une égalité stricte laissait donc l'ensorceleur avec un grimoire vide
 * (20 sorts de niveau 1 invisibles). On accepte donc le libellé exact ou un
 * jeton qui le préfixe (`Libellé/École`) — sans jamais matcher par simple
 * début de chaîne, pour ne pas confondre deux classes.
 */
export function spellMatchesClass(
  classes: string[] | undefined | null,
  classLabel: string | undefined | null,
): boolean {
  if (!classLabel || !classes?.length) return false;
  return classes.some((c) => c === classLabel || c.startsWith(`${classLabel}/`));
}

export function getSpellSaveDc(sheet: CharacterSheet): number | null {
  if (!sheet.sorts.caracIncantation) return null;
  return spellSaveDc(effectiveCarac(sheet, sheet.sorts.caracIncantation), getLevel(sheet));
}

export function getSpellAttackBonus(sheet: CharacterSheet): number | null {
  if (!sheet.sorts.caracIncantation) return null;
  return spellAttackBonus(effectiveCarac(sheet, sheet.sorts.caracIncantation), getLevel(sheet));
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function getLevelFromXp(xp: number): number {
  return levelFromXp(xp);
}

export function getNextXpThreshold(xp: number): number {
  const level = levelFromXp(xp);
  if (level >= 20) return xp;
  return xpThreshold(level + 1);
}

export { SKILLS, SKILL_CARAC };
export type { Carac, Skill };
