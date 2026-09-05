// Mini-rendu markdown pour les corps de fiches du compendium.
// Tout est échappé AVANT injection de nos propres balises (audit §5.8) ;
// seules <sup>/<sub> (présents dans le DRS) sont réautorisés, patterns stricts.

export interface MdTable {
  type: "table";
  headers: string[];
  /** en-tête « parent » (2ᵉ ligne DRS avec « ^^ ») → rendu en double ligne */
  headerTop?: string[];
  rows: string[][];
}
export interface MdHeading {
  type: "heading";
  level: number; // 4 → h4, 5 → h5, 6 → h6
  text: string;
}
export interface MdList {
  type: "list";
  items: string[];
}
export interface MdPara {
  type: "para";
  text: string;
}
export type MdBlock = MdTable | MdHeading | MdList | MdPara;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function inlineHtml(s: string): string {
  return (
    escapeHtml(s)
      // balises tolérées du DRS (ré-échappées depuis &lt;)
      .replace(/&lt;sup&gt;(.{1,24}?)&lt;\/sup&gt;/g, "<sup>$1</sup>")
      .replace(/&lt;sub&gt;(.{1,24}?)&lt;\/sub&gt;/g, "<sub>$1</sub>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      // liens internes DRS (absolus ou ancres) : texte souligné, non cliquable v1
      .replace(/\[([^\]]+)\]\((?:#[^)]*|\/[^)]*)\)/g, '<span class="linkish">$1</span>')
  );
}

/** « D6 » (en-tête de colonne de table de lancés) → 6, sinon null. */
export function diceCol(header: string): number | null {
  const m = /^d\s*(\d{1,3})$/i.exec(header.replace(/\*\*/g, "").trim());
  return m ? Number(m[1]) : null;
}

export interface SuperHeader {
  text: string;
  span: number;
  rowspan: number;
}

/**
 * Transforme un en-tête à 2 niveaux en rangée HTML : les colonnes dont le
 * label « parent » vaut aussi la sous-colonne (fusion verticale « ^^ ») → un
 * seul <th rowspan=2> ; sinon le label parent couvre ses sous-colonnes
 * (colspan), rendues dans la rangée suivante.
 */
export function superHeaders(top: string[], bottom: string[]): SuperHeader[] {
  const out: SuperHeader[] = [];
  let c = 0;
  while (c < top.length) {
    const t = top[c] ?? "";
    if (t && t === (bottom[c] ?? "")) {
      out.push({ text: t, span: 1, rowspan: 2 });
      c++;
      continue;
    }
    if (!t) {
      out.push({ text: "", span: 1, rowspan: 1 });
      c++;
      continue;
    }
    let span = 1;
    let k = c + 1;
    while (k < top.length && ((top[k] ?? "") === "" || top[k] === t)) {
      span++;
      k++;
    }
    out.push({ text: t, span, rowspan: 1 });
    c = k;
  }
  return out;
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith("|");
}

function splitPipes(line: string): string[] {
  const parts = line.trim().split("|");
  parts.shift();
  parts.pop();
  return parts.map((c) => c.replace(/&nbsp;/g, " ").trim());
}

/** Découpe le markdown d'une section en blocs typés. */
export function toBlocks(markdown: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "para", text: para.join(" ") });
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // conteneurs VuePress du DRS : « §§§ .table-container » / « §§§ »
    if (trimmed.startsWith("§§§")) continue;

    // titres imbriqués (le ## a déjà découpé les sections)
    const h = /^(#{3,6})\s+(.+?)\s*$/.exec(trimmed);
    if (h) {
      flushAll();
      const level = Math.min(6, h[1]!.length + 1); // ### → h4
      blocks.push({ type: "heading", level, text: h[2]! });
      continue;
    }
    // un titre # de niveau 1 duplique le titre de la fiche
    if (/^#\s+/.test(trimmed)) continue;

    // tableau
    if (isTableLine(trimmed)) {
      // Le DRS met parfois l'en-tête sur 2 lignes (colonne « parent » + sous-
      // colonnes « ^^ ») : le séparateur n'est donc pas forcément la ligne suivante.
      let sepIdx = -1;
      const limit = Math.min(i + 4, lines.length);
      for (let k = i + 1; k < limit; k++) {
        const cand = lines[k] ?? "";
        if (isTableLine(cand) && /^[\s|:-]+$/.test(cand.trim())) {
          sepIdx = k;
          break;
        }
      }
      if (sepIdx !== -1) {
        flushAll();
        const headerLines: string[][] = [];
        for (let k = i; k < sepIdx; k++) headerLines.push(splitPipes(lines[k]!));
        const width = Math.max(...headerLines.map((h) => h.length));
        for (const h of headerLines) while (h.length < width) h.push("");

        // « ^^ » = répète la cellule juste au-dessus (fusion verticale du DRS)
        for (let r = 1; r < headerLines.length; r++) {
          for (let c = 0; c < width; c++) {
            if (headerLines[r]![c] === "^^") headerLines[r]![c] = headerLines[r - 1]![c] ?? "";
          }
        }

        const headers = headerLines[headerLines.length - 1]!;
        const headerTop = headerLines.length > 1 ? headerLines[0]! : undefined;

        const rows: string[][] = [];
        let prev: string[] | null = null;
        let j = sepIdx + 1;
        while (j < lines.length && isTableLine(lines[j]!)) {
          const cells = splitPipes(lines[j]!);
          while (cells.length < headers.length) cells.push("");
          // ligne de groupe « **Chat** » vide ailleurs → section du tableau
          const first = cells[0] ?? "";
          const restEmpty = cells.slice(1).every((x) => x === "");
          if (/^\*\*.*\*\*$/.test(first) && restEmpty) {
            rows.push([`__group__${first.replace(/\*\*/g, "")}`]);
          } else {
            const resolved = cells.map((x, idx) => (x === "^^" ? (prev?.[idx] ?? "") : x));
            prev = resolved;
            rows.push(resolved);
          }
          j++;
        }
        blocks.push({ type: "table", headers, rows, ...(headerTop ? { headerTop } : {}) });
        i = j - 1;
        continue;
      }
    }

    const li = /^[*+-]\s+(.+)$/.exec(trimmed);
    if (li) {
      flushPara();
      list.push(li[1]!);
      continue;
    }
    if (!trimmed) {
      flushAll();
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushAll();
  return blocks;
}

export interface Section {
  heading: string | null;
  blocks: MdBlock[];
}

export function renderEntryBody(
  body: { heading: string | null; markdown: string }[] | null,
): Section[] {
  return (body ?? []).map((sec) => ({ heading: sec.heading, blocks: toBlocks(sec.markdown) }));
}
