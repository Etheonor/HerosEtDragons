export type EncreKey = "carmin" | "brique" | "ocre" | "foret";

export interface EncrePalette {
  label: string;
  base: string;
  hover: string;
  border: string;
  text: string;
}

export const ENCRE_PALETTES: Record<EncreKey, EncrePalette> = {
  carmin: {
    label: "Carmin",
    base: "#C0392B",
    hover: "#D0473A",
    border: "#8F281D",
    text: "#E0705F",
  },
  brique: {
    label: "Brique",
    base: "#D0473A",
    hover: "#DC5C50",
    border: "#A22F23",
    text: "#E8877A",
  },
  ocre: { label: "Ocre", base: "#B8860B", hover: "#CC9A1F", border: "#8A6508", text: "#D4A73C" },
  foret: { label: "Forêt", base: "#5E8C61", hover: "#6FA073", border: "#46694A", text: "#8AB58D" },
};

export const ENCRE_KEYS = Object.keys(ENCRE_PALETTES) as EncreKey[];

const STORAGE_KEY = "hd-encre";

function isEncreKey(v: string | null): v is EncreKey {
  return !!v && v in ENCRE_PALETTES;
}

export function getEncre(): EncreKey {
  if (typeof localStorage === "undefined") return "carmin";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isEncreKey(v) ? v : "carmin";
  } catch {
    return "carmin";
  }
}

export function applyEncre(key: EncreKey): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.encre = key;
  }
}

export function setEncre(key: EncreKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* stockage indisponible : le choix ne survit pas au rechargement */
  }
  applyEncre(key);
}
