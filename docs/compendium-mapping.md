# 8.0 — Étude de mappage DRS → Compendium

> Vérifié le 2026-09-05 sur la copie locale `/Users/michael/Documents/Git/heros-et-dragons-drs`
> (`docs/`, 36 dossiers). Ce document fige les décisions d'ingestion avant de coder le parser (8.1).

## 1. Realité du terrain (recensement)

| Type de source | Où | Format | Vol. |
|---|---|---|---|
| Fiches typées | `bestiaire/<slug>/` (753), `grimoire/<slug>/` (361), `liste-objets-magiques/<slug>/` (301) | YAML frontmatter complet + corps markdown | 1 415 |
| Fiches semi-typées | `races/<slug>/` (13), `classes/<slug>/` (12), `personnalite-et-historique/<slug>/` (16 : historiques + personnalités), `les-cinq-royaumes/<slug>/` (6) | frontmatter pauvre (`title` seul), corps structuré par conventions (gras `** truc **`, tableaux d'évolution) | ~47 |
| Gros tableaux uniques | `armes/`, `armures/`, `outils/`, `marchandises/`, `montures-et-vehicules/`, `poisons/`, `pieges/`, `maladies/`, `folie/`, `objets-opposition/`, `options-de-personnalisation/` (liste des dons en `#### <Don>`) | un README, markdown + conteneurs `§§§ .table-container` | ~250 lignes tabulaires |
| Chapitres de règles | `combattre/`, `utiliser-les-caracteristiques/`, `lancer-des-sorts/`, `gerer-la-sante-du-personnage/`, etc. (18 dossiers `readme_racine=1, fiches=0`) | prose longue, ancres `#titre` | — |
| **États** | **N'existe pas en chapitre consolidé.** `à terre` vit dans les actions de `combattre/` + un lien `/gerer-la-sante-du-personnage/#a-terre` ; pas d'appendice « conditions » comme le SRD. | dispersé | — |

Liens internes DRS = chemins absolus de wiki : `[jet de sauvegarde](/utiliser-les-caracteristiques/#jets-de-sauvegarde)`.

## 2. Catégories canoniques du compendium (R11.2) → sources

| Catégorie | Source(s) | Mode | Visibilité |
|---|---|---|---|
| `bestiaire` | bestiaire/ | YAML (fiche complète : `abilityScores`, `ac`, `skills[{name,isExpert}]`, `movement`, `senses`, `telepathy`, `environments`, `challenge`, `source`, `source_page`) | MJ |
| `grimoire` | grimoire/ | YAML (`school`, `level`, `classes[]`, `concentration`, `ritual`, `casting_time`, `range`, `components{verbal,somatic,material,materials}`, `duration`) | public |
| `races` | races/ | corps typé « à la main » (paragraphes `**Augmentation de caractéristiques**`, `**Vitesse**`…) → extraction par conventions de gras | public |
| `classes` | classes/ | tableau d'évolution markdown + sections d'aptitudes (`## Aptitude nom`) | public |
| `historiques` | personnalite-et-historique/ (les 16) | corps : `**Compétences** :`, `**Outils maîtrisés** :`, `**Équipement** :`, `## Aptitude <nom>` | public |
| `dons` | options-de-personnalisation/ (sections `#### <Don>` sous « Liste des dons ») | découpage de README | public |
| `equipement` | armes/ + armures/ + outils/ + montures-et-vehicules/ + marchandises/ | découpage de tableaux : 1 ligne = 1 entrée (`type` = provenance) | public |
| `objets-magiques` | liste-objets-magiques/ | YAML (`type`, `subtype`, `rarity`, `attunement`, `source`) | MJ |
| `etats` | — (compilation) | **catégorie « maison » éditée par nous** : les 13 états actuels, corps = règle compilée + `source_page` des chapitres | public |
| `regles` | les 18 chapitres | rendu brut sans index programmatique (voir §5) | public |

## 3. Décisions d'ingestion

1. **Slug** = nom du dossier (déjà normalisé minuscules-accentués-strip) ; pour les découpages : slug dérivé du libellé de ligne/d'ancre, stables par contenu, conflictés avec suffixe si doublon.
2. **Hash & versionnement** : sha256 du markdown brut par entrée + SHA du repo source en colonne `ingest_commit`. Ré-ingestion = diff (ajout/modif/suppr) écrit dans un rapport JSON ; **jamais d'écrasement silencieux des modifs homebrew** (clés `source:"maison"` intouchées).
3. **Corps rendu** : sections `{heading, paragraphs[]}` (le `body` du schéma canonique design §7) ; on garde le markdown brut par entrée + rendu simplifié côté client (listes, gras, liens internes résolvis, tableaux légers).
4. **Liens internes** : table de correspondance statique `/chapitre/#ancre → compendium://regles/chapitre#ancre` (les 18 chapitres → ids stables) ; lien non résolu → texte rendu sans lien (pas de 404).
5. **Frontmatter parser** : `gray-matter` (YAML simple) ; listes d'objets imbriqués OK ; coquilles observées : `title:` tantôt cité tantôt pas (YAML l'absorbe), `description` absent de certaines fiches bestiaire → optionnel partout.
6. **États** : on ne « parse » pas le DRS pour les états ; la catégorie `etats` est seedée par nous (les 13 connus + leurs références `regles`), extensible par le MJ (homebrew). Les chips de la table et l'UI de création liront cette catégorie (remplace le `CONDITIONS` codé en dur, task du même nom).
7. **Chaîne de sécurité** : le champ `visibility` porte la règle ; l'API ne sert JAMAIS une fiche `mj` à un joueur, et le `bestiaire`/`objets-magiques` ne sont pas listables (ni comptés) côté joueur.
8. **Contenu homebrew** : même schéma, `source:"maison"`, éditable par le MJ (CRUD hors ingestion ; l'éditeur lui-même est une tâche ultérieure — 8.5+).

## 4. Schéma D1 (esquisse pour 8.2)

```
compendium_entries(
  id uuid pk,
  category text, slug text,           -- unique(category, slug)
  title text, source text, source_page int,
  meta text(json),                   -- champs typés par catégorie
  body text(json),                   -- sections [{heading, paragraphs}]
  visibility text('public'|'mj') default 'public',
  origin text('drs'|'maison'),
  hash text, ingest_commit text,
  created_at, updated_at
)
compendium_search(slug, category, title, tags, level, fp, school, type) -- index FTS d1 ou LIKE borné
```

Recherche v1 : `LIKE` sur titre + catégorie + filtres (niveau d'école pour sorts, FP pour bestiaire), tri pertinence simple. FTS5 D1 si les 1 400 fiches s'avèrent lentes.

## 5. Scope v1 / différé

**v1 (8.1–8.6)** : 8 000 fiches typées (bestiaire, grimoire, objets magiques) + races/classes/historiques/dons (semi-typées) + découpage tableaux équipement + `etats` seedé + `/compendium` (rail 3 colonnes, recherche, fiche, badges MJ) + filtrage visibilité serveur + « posera sur la carte (PNJ) » → modèle de la bibliothèque + tooltips d'états.

**Différé v2** : chapitres `regles` rendus intégralement (structure conservée dès v1, indexés mais sans recherche plein texte), montage d'équipement par catégorie dans les pickers de feuille (9b), rendu markdown durci DOMPurify, éditeur homebrew MJ complet, liens de règles « connexes ».

## 6. Pipeline cible (rappel)

`pnpm --filter ingest run` : lit `DRS_PATH` (défaut : copie locale ; en CI ingestion manuelle, pas au deploy) → parse par mode → upsert diff local D1 → rapport JSON ; flag `--remote` pour appliquer en prod. **Le Worker ne fait jamais tourner le parser** ; l'ingest produit des lignes D1.

---

## À valider avant de coder 8.1 (réponses = modifications de ce doc)

1. **`etats` = catégorie maison seedée par nous** plutôt qu'extraction DRS (pas de source consolidée dans le wiki) — OK ?
2. **Visibilité** : `bestiaire` + `objets-magiques` = MJ (proposé, suit le prototype Compendium sombre) — confirmer.
3. **Montures/poisons/pièges/maladies** : ingérés en v1 comme sous-produits d'`equipement`/catégories propres, ou reportés ? (proposé : v1 = armes/armures/outils/marchandises montures ; poisons/pièges/maladies/folie v2 — peu utilisés en session hors bestiaire).
