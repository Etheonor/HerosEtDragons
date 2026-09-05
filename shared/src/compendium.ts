// ═══════════════════════════════════════════════════════════
// RollWith H&D — Schéma canonique du compendium (R11, phase 8)
// Une seule représentation pour le DRS ingéré ET le homebrew MJ.
// visibility porte la règle : l'API ne sert jamais une fiche `mj`
// à un client joueur (design §7 / audit §3.4).
// ═══════════════════════════════════════════════════════════

export const COMPENDIUM_CATEGORIES = [
  "bestiaire",
  "grimoire",
  "races",
  "classes",
  "historiques",
  "dons",
  "equipement",
  "objets-magiques",
  "etats",
  "regles",
] as const;

export type CompendiumCategory = (typeof COMPENDIUM_CATEGORIES)[number];

/** Visibilité par défaut à l'ingestion (le MJ peut publier une fiche maison). */
export function defaultVisibilityFor(category: CompendiumCategory): "public" | "mj" {
  return category === "bestiaire" || category === "objets-magiques" ? "mj" : "public";
}

export interface BodySection {
  heading: string | null;
  markdown: string;
}

export interface MonsterMeta {
  type: string;
  subtype?: string;
  size: string;
  alignment: string;
  /** facteur de puissance (les monstres) */
  fp: number;
  caracs: { for: number; dex: number; con: number; int: number; sag: number; cha: number };
  ca: { value?: number; armor?: string; hasShield?: boolean }[];
  /** nombre de dés de vie (la face dépend de la taille : calcul à l'affichage) */
  hitDiceCount: number;
  savingThrows?: string[];
  skills?: { name: string; isExpert: boolean }[];
  movement?: { walk?: number; swim?: number; fly?: number; burrow?: number; climb?: number };
  senses?: { darkvision?: number; blindsight?: number; tremorsense?: number };
  telepathy?: number;
  languages?: string[];
  environments?: string[];
  dungeonTypes?: string[];
}

export interface SpellMeta {
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  castingTime: string;
  range: string;
  components: { verbal: boolean; somatic: boolean; material?: boolean; materials?: string };
  duration: string;
  classes: string[];
  description?: string;
}

export interface EquipmentMeta {
  /** origine du tableau source : arme | armure | outil | monture | marchandise */
  kind: string;
  price?: string;
  weight?: string;
  damage?: string;
  properties?: string;
  ac?: string | number;
  stealth?: string;
  [extra: string]: unknown;
}

export interface ObjectMeta {
  type: string;
  subtype?: string | false;
  rarity: string;
  attunement?: string;
}

export interface TraitMeta {
  /** race/classe/historique/don/état : contenu essentiellement textuel */
  [extra: string]: unknown;
}

export type CompendiumMeta =
  | Partial<MonsterMeta>
  | Partial<SpellMeta>
  | Partial<EquipmentMeta>
  | Partial<ObjectMeta>
  | TraitMeta;

export interface CompendiumEntry {
  slug: string;
  category: CompendiumCategory;
  title: string;
  /** "Manuel des règles", "Créatures & Oppositions", "maison", … */
  source: string;
  sourcePage?: number;
  meta: CompendiumMeta;
  body: BodySection[];
  visibility: "public" | "mj";
  origin: "drs" | "maison";
  /** index de recherche v1 : titre + catégorie + mots-clés, minuscules sans accents */
  searchText: string;
  /** incrémenté à chaque ré-ingestion qui modifie la fiche */
  version: number;
  hash: string;
  ingestCommit?: string;
  /** homebrew : rattaché à une campagne ; absent = global */
  campaignId?: string;
}

/** Clé unique d'une entrée dans le compendium. */
export function entryKey(category: CompendiumCategory, slug: string): string {
  return `${category}/${slug}`;
}

/** Dé de vie d'une créature selon sa taille (Taille → die). */
export function sizeHitDie(size: string | undefined): number {
  switch ((size ?? "").toUpperCase()) {
    case "T":
    case "TRÈS PETITE":
    case "TP":
      return 4;
    case "P":
    case "PETITE":
      return 6;
    case "M":
    case "MOYENNE":
      return 8;
    case "G":
    case "GRANDE":
      return 10;
    case "TG":
    case "TRÈS GRANDE":
      return 12;
    case "C":
    case "COLossale":
    case "COLOSSALE":
      return 20;
    default:
      return 8;
  }
}

function caracMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** PV moyens estimés d'une créature (le DRS ne stocke que le nombre de dés). */
export function monsterAveragePv(meta: Partial<MonsterMeta>): number {
  const count = meta.hitDiceCount ?? 0;
  if (!count) return 0;
  const die = sizeHitDie(meta.size);
  const conMod = caracMod(meta.caracs?.con ?? 10);
  return Math.max(1, Math.round((count * (die + 1)) / 2 + conMod * count));
}

/** CA estimée : 10 + mod DEX + bonus d'armure (+ bouclier ~2) quand le DRS ne donne pas de CA chiffrée. */
export function monsterCa(meta: Partial<MonsterMeta>): number {
  const first = meta.ca?.[0];
  if (first?.value !== undefined) return first.value;
  const armor = first?.armor;
  const shield = first?.hasShield ? 2 : 0;
  const dex = caracMod(meta.caracs?.dex ?? 10);
  // bonus « armure naturelle » donné en valeur implicite par le wiki (ex. gobelin) :
  // sans valeur chiffrée on estime 10 + dex + bouclier.
  return 10 + dex + shield + (armor && /naturelle/.test(armor) ? 1 : 0);
}

// EOF compendium.ts
