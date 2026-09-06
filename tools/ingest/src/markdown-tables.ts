// Extraction générique des tableaux markdown du DRS (avec lignes de groupe
// « **Armures légères** » et séparateurs vides), tolérante aux colonnes
// manquantes (rafistolées à la largeur de l'en-tête).

export interface Table {
  headers: string[];
  /** ligne d'en-tête secondaire (« ^^ » + niveaux de sort) — informative */
  headerTop?: string[];
  rows: TableRow[];
}

export interface TableRow {
  /** cellules alignées sur headers (texte nettoyé) */
  cells: string[];
  /** ligne-groupe (« **Catégorie** » seul) */
  group: string | null;
}

function splitPipes(line: string): string[] {
  const parts = line.split("|");
  // une ligne de tableau commence et finit par « | »
  parts.shift();
  parts.pop();
  return parts.map((c) => c.replace(/&nbsp;/g, " ").trim());
}

export function extractTables(md: string): Table[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const tables: Table[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trim().startsWith("|")) {
      const headerLine = lines[i]!;
      // En-tête à deux niveaux du DRS : une ligne « ^^ » (parfois avec les
      // niveaux de sort « 1<sup>er</sup> ») suit le header principal — elle
      // est conservée telle quelle, le séparateur vient juste après.
      let headerTop: string[] | undefined;
      let sepIdx = i + 1;
      if (lines[sepIdx]?.includes("^^")) {
        headerTop = splitPipes(lines[sepIdx]!).map((c) => c.replace(/\^\^/g, "").trim());
        sepIdx = i + 2;
      }
      const sepLine = lines[sepIdx] ?? "";
      if (sepLine.trim().startsWith("|") && /^[\s|:-]+$/.test(sepLine)) {
        const headers = splitPipes(headerLine);
        const rows: TableRow[] = [];
        let j = sepIdx + 1;
        let currentGroup: string | null = null;
        while (j < lines.length && lines[j]!.trim().startsWith("|")) {
          const cells = splitPipes(lines[j]!);
          while (cells.length < headers.length) cells.push("");
          const first = cells[0] ?? "";
          const restEmpty = cells.slice(1).every((c) => c === "");
          if (first.startsWith("**") && first.endsWith("**") && restEmpty) {
            currentGroup = first.replace(/\*\*/g, "");
          } else if (cells.every((c) => c === "")) {
            // séparateur vide — ignorer
          } else {
            rows.push({
              cells: cells.map((c) => c.replace(/\*\*/g, "").trim()),
              group: currentGroup,
            });
          }
          j++;
        }
        tables.push({ headers, headerTop, rows });
        i = j;
        continue;
      }
    }
    i++;
  }
  return tables;
}
