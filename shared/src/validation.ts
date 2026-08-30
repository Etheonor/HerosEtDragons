// ═══════════════════════════════════════════════════════════
// RollWith H&D — Validation de la feuille de personnage (audit §5.2)
// Validation structurelle + bornes, pure et testable, sur input unknown.
// Retourne un message d'erreur lisible, ou null si la feuille est valide.
// ═══════════════════════════════════════════════════════════

const STR_MAX = 500;
const TEXT_MAX = 4000;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max = STR_MAX, label: string): string | null {
  if (typeof v !== "string") return `${label} : texte attendu`;
  if (v.length > max) return `${label} : trop long (max ${max})`;
  return null;
}

function int(v: unknown, min: number, max: number, label: string): string | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    return `${label} : entier attendu entre ${min} et ${max}`;
  }
  return null;
}

function bool(v: unknown, label: string): string | null {
  if (typeof v !== "boolean") return `${label} : booléen attendu`;
  return null;
}

function strArray(v: unknown, maxItems: number, maxLen: number, label: string): string | null {
  if (!Array.isArray(v) || v.length > maxItems) return `${label} : liste invalide`;
  for (const item of v) {
    if (typeof item !== "string" || item.length > maxLen) return `${label} : élément invalide`;
  }
  return null;
}

function check(errors: (string | null)[]): string | null {
  return errors.find((e) => e !== null) ?? null;
}

export function validateCharacterSheet(raw: unknown): string | null {
  if (!isObj(raw)) return "Feuille invalide";
  const s = raw;

  const identite = s.identite;
  if (!isObj(identite)) return "identite manquant";
  const identiteErr = check([
    str(identite.nom, 100, "nom"),
    str(identite.race, 100, "race"),
    str(identite.classe, 100, "classe"),
    str(identite.historique, 100, "historique"),
    str(identite.alignement, 60, "alignement"),
    identite.citation === undefined || identite.citation === null
      ? null
      : str(identite.citation, TEXT_MAX, "citation"),
    int(identite.niveau, 1, 20, "niveau"),
    int(identite.xp, 0, 5_000_000, "xp"),
  ]);
  if (identiteErr) return identiteErr;

  const caracs = s.caracs;
  if (!isObj(caracs)) return "caracs manquant";
  for (const k of ["for", "dex", "con", "int", "sag", "cha"]) {
    const e = int(caracs[k], 1, 30, `carac ${k}`);
    if (e) return e;
  }

  const saves = s.saveProficiencies;
  if (!isObj(saves)) return "saveProficiencies manquant";
  for (const k of ["for", "dex", "con", "int", "sag", "cha"]) {
    const e = bool(saves[k], `save ${k}`);
    if (e) return e;
  }

  const skills = s.skillProficiencies;
  if (!isObj(skills)) return "skillProficiencies manquant";
  if (Object.keys(skills).length > 40) return "skillProficiencies trop volumineux";
  for (const v of Object.values(skills)) {
    const e = bool(v, "maitrise de compétence");
    if (e) return e;
  }

  const coreErr = check([
    int(s.ca, 0, 40, "CA"),
    str(s.vitesse, 40, "vitesse"),
    int(s.initiativeBonus, -5, 20, "bonus d'initiative"),
    int(s.pvMax, 0, 1000, "pvMax"),
    int(s.pvTemp, 0, 1000, "pvTemp"),
    bool(s.inspiration, "inspiration"),
  ]);
  if (coreErr) return coreErr;

  const dv = s.desDeVie;
  if (!isObj(dv)) return "desDeVie manquant";
  const dvErr = check([
    int(dv.faces, 4, 12, "dés de vie (faces)"),
    int(dv.total, 0, 21, "dés de vie (total)"),
    int(dv.restants, 0, 21, "dés de vie (restants)"),
  ]);
  if (dvErr) return dvErr;

  const death = s.deathSaves;
  if (!isObj(death)) return "deathSaves manquant";
  const deathErr = check([
    int(death.successes, 0, 3, "jets contre la mort (réussites)"),
    int(death.failures, 0, 3, "jets contre la mort (échecs)"),
  ]);
  if (deathErr) return deathErr;

  if (!Array.isArray(s.attaques) || s.attaques.length > 30) return "attaques invalide";
  for (const a of s.attaques as unknown[]) {
    if (!isObj(a)) return "attaque invalide";
    const e = check([
      str(a.id, 60, "attaque id"),
      str(a.name, 100, "attaque nom"),
      int(a.bonus, -5, 30, "attaque bonus"),
      str(a.damage, 40, "attaque dégâts"),
    ]);
    if (e) return e;
  }

  if (!Array.isArray(s.capacites) || s.capacites.length > 60) return "capacites invalide";
  for (const c of s.capacites as unknown[]) {
    if (!isObj(c)) return "capacité invalide";
    const e = check([
      str(c.id, 60, "capacité id"),
      str(c.name, 100, "capacité nom"),
      str(c.description, TEXT_MAX, "capacité description"),
    ]);
    if (e) return e;
  }

  const sorts = s.sorts;
  if (!isObj(sorts)) return "sorts manquant";
  if (!Array.isArray(sorts.connus) || sorts.connus.length > 200) return "sorts connus invalide";
  if (!Array.isArray(sorts.emplacements) || sorts.emplacements.length > 10) {
    return "emplacements de sorts invalides";
  }
  for (const lv of sorts.emplacements as unknown[]) {
    if (!isObj(lv)) return "emplacement invalide";
    const e = check([
      int(lv.level, 0, 9, "niveau d'emplacement"),
      int(lv.max, 0, 16, "emplacements max"),
      int(lv.used, 0, 16, "emplacements utilisés"),
    ]);
    if (e) return e;
  }

  const persona = s.personnalite;
  if (!isObj(persona)) return "personnalite manquant";
  for (const k of ["traits", "ideaux", "liens", "defauts"]) {
    if (persona[k] !== undefined && persona[k] !== null) {
      const e = str(persona[k], TEXT_MAX, `personnalité ${k}`);
      if (e) return e;
    }
  }

  const langErr = str(s.languesEtMaitrises, TEXT_MAX, "langues & maîtrises");
  if (langErr) return langErr;

  const equip = s.equipement;
  if (!isObj(equip)) return "equipement manquant";
  const bourse = equip.bourse;
  if (!isObj(bourse)) return "bourse manquante";
  const bourseErr = check([
    int(bourse.po, 0, 1_000_000, "po"),
    int(bourse.pa, 0, 1_000_000, "pa"),
    int(bourse.pc, 0, 1_000_000, "pc"),
  ]);
  if (bourseErr) return bourseErr;
  if (!Array.isArray(equip.objets) || equip.objets.length > 200) return "objets invalide";
  for (const o of equip.objets as unknown[]) {
    if (!isObj(o)) return "objet invalide";
    const e = check([str(o.name, 200, "objet nom"), int(o.qty, 0, 9999, "objet quantité")]);
    if (e) return e;
  }

  const couleurErr = str(s.couleurPion, 20, "couleur du pion");
  if (couleurErr) return couleurErr;

  return null;
}

// EOF validation.ts
