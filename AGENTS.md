# RollWith H&D (`rollwith-hd`) — guide d'orientation

> Ce fichier sert de point d'entrée pour tout assistant ou humain reprenant le projet.
> Il ne remplace pas `docs/requirements.md` (spec) ni `docs/design.md` (architecture détaillée) :
> il donne la carte, les commandes et les conventions à connaître avant de toucher au code.

## 1. Ce qu'est le projet

Table de jeu virtuelle (H&D / D&D 5e-like) pour un petit groupe de joueurs via
Discord. Auth Discord, campagnes privées avec liens d'invitation, table de jeu
temps réel (carte, pions, brouillard, combat, initiative, dés, journal), feuille
de personnage, et un compendium de règles issu du DRS (1 579 fiches).

Déployé sur **Cloudflare Workers** (Worker Hono + Durable Object par campagne +
D1 + R2). Le site est une SPA SvelteKit servie par le Worker.

## 2. Monorepo (pnpm workspaces)

| Workspace       | Rôle                                                     | Point d'entrée              |
| --------------- | -------------------------------------------------------- | --------------------------- |
| `api/`          | Worker Hono + DO `GameTableDO` (temps réel)              | `api/src/index.ts`          |
| `web/`          | SPA SvelteKit 5 (adapter-static, ssr=false)              | `web/src/routes/`           |
| `shared/`       | Domaine pur **partagé** (Zod, règles, dés, protocole WS) | `shared/src/index.ts`       |
| `tools/ingest/` | Ingestion du DRS → table compendium (CLI)                | `tools/ingest/src/index.ts` |
| `portraits/`    | Outil local de conversion d'images (hors dépôt)          | —                           |

Points d'attention :

- **`shared/` n'a AUCUNE dépendance runtime hors `zod`** : tout ce qui est règle
  métier, schéma ou protocole vit là, testé unitairement, importé par `api` _et_
  `web`. Ne jamais mettre de logique métier dans `api/` ou `web/`.
- **`shared/package.json` déclare des conditions `require` ET `import`** vers les
  mêmes fichiers ESM. C'est nécessaire : `drizzle-kit` tourne en CJS et ne peut
  pas résoudre des exports ESM-only. Ne pas retirer `require` sans vérifier
  `pnpm --filter api db:generate`.
- **`api/src/do/game-table.ts` est le fichier le plus critique du projet**
  (~2 300 lignes) : il porte toute la logique temps réel, le journal SQLite du
  DO, la visibilité des PNJ, le combat. Toute modification doit passer par
  `api/test/game-table.test.ts`.

## 3. Commandes

```bash
pnpm check          # LA commande de validation : lint + format + typecheck + tests
                    # (oxlint, oxfmt, svelte-check, vitest) — tout doit être vert.

pnpm dev            # wrangler dev seul (API + build statique sur :8787)
pnpm dev:web        # vite dev seul (:5173, HMR) — proxy /api vers :8787
pnpm dev:all        # build web + vite (:5173) + wrangler (:8787)
pnpm dev:clean      # arrête TOUTES les instances wrangler/workerd du dépôt
                    # (`pnpm dev`/`dev:all` le font déjà avant de démarrer, et
                    # `pnpm e2e` s'en sert pour purger les orphelins)

pnpm --filter api typecheck        # tsc --noEmit
pnpm --filter api test             # tests d'intégration DO (workerd + D1 + WS réels)
pnpm --filter web check            # svelte-check
pnpm --filter shared build         # IMPORTANT : à lancer après toute modif de shared/,
                                   # car api/ et web/ lisent shared/dist (exports)
pnpm db:generate                   # drizzle-kit generate (après modif de api/src/db/schema.ts)
pnpm db:migrate                    # applique les migrations en local (.wrangler)
pnpm ingest -- --apply --local     # (re-)ingestion du DRS dans le compendium
```

**Piège** : `api/` et `web/` importent `@rollwith/shared/*` via `shared/dist`.
Après toute modification de `shared/src/`, lancer `pnpm --filter shared build`,
sinon le typecheck échoue sur des types obsolètes.

## 4. Portées de développement

- **Port 8787** (wrangler) = l'application complète et fonctionnelle : build
  statique + API + WebSocket. C'est l'URL de dev de référence.
- **Port 5173** (vite) = développement front avec HMR. `web/vite.config.ts`
  relaie `/api` (HTTP **et** WebSocket via `ws: true`) vers 8787.

## 4bis. Mode dev, seed et e2e

Un mode local contourne l'auth Discord pour l'outillage (tests, e2e, banc
d'essai). Il est **verrouillé trois fois** (`api/src/middleware.ts`,
`resolveDevUser`) :

1. `DEV_AUTH=1` dans **`.dev.vars`** (gitignoré, jamais dans les secrets prod) ;
2. l'**hôte** de la requête doit être une boucle locale (`isLocalHost`) ;
3. un cookie `hd-dev-user` posé par `POST /api/dev/login`.

Sans `DEV_AUTH`, **toutes** les routes `/api/dev/*` renvoient 404 et le cookie
ne vaut rien. Ne jamais définir `DEV_AUTH` en production.

```bash
pnpm e2e              # 27 tests navigateur (Playwright) — démarre 8787 si besoin
pnpm e2e:ui           # mode interactif
pnpm e2e:headed       # navigateur visible
pnpm dev:seed         # réinitialise la fixture (campagne dev-camp)
```

La fixture seedée : campagne `dev-camp`, utilisateurs `mj` / `kaelith` /
`ragnar`, personnages `pj-kaelith` / `pj-ragnar` / `pnj-gobelin`, cartes
`map-image` (avec image) et `map-grid`. `POST /api/dev/seed {"reset":true}`
purgeraussi le Durable Object — sans quoi l'état survit d'un run à l'autre.

Les tests REST (`api/test/rest.test.ts`) utilisent le même bypass : le binding
`DEV_AUTH: "1"` est injecté par `api/vitest.config.ts`, et les requêtes
utilisent l'hôte `localhost`.

## 5. Documentation existante (`docs/`)

| Document                                      | Contenu                                              | État                               |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `requirements.md`                             | Spec fonctionnelle R1–R14                            | référence                          |
| `design.md`                                   | Architecture §1–§10 (schéma D1, protocole WS, DS)    | référence                          |
| `tasks.md`                                    | Plan d'implémentation phases 0–10                    | **périmé** (juil. 2026) — voir §6  |
| `HANDOFF-2026-09-05.md`                       | État complet au 05/09, pièges, reste à faire         | historique                         |
| `audit-2026-08-30.md` / `audit-2026-09-05.md` | Audits successifs                                    | historiques                        |
| `audit-herosetdragons-2026-09-06-v2.md`       | **Audit de référence** (celui traité en sept.)       | §6 non mis à jour après correctifs |
| `compendium-mapping.md`                       | Mapping DRS → catégories                             | référence                          |
| `atlas-benchmark/`                            | **Benchmark Atlas + plan de refonte UX/UI** (9 lots) | chantier à faire — voir §10        |
| `brouillard-optimisation.md`                  | Ticket d'optimisation du brouillard, **indépendant** | à faire sur `main`                 |

## 6. Écarts connus entre `tasks.md` et la réalité

`tasks.md` date de juillet 2026 et **n'a pas été mis à jour** : il présente des
phases comme non faites qui le sont en réalité. Ne pas s'y fier pour l'état
courant ; se fier à `git log`.

Phases largement **réalisées** malgré `[ ]` dans tasks.md :

- Phase 8 (Compendium) : ingestion, API, écran 3 colonnes, partage MJ,
  tooltips — tout livré sauf **8.8 homebrew** (éditeur de fiches maison).
- Phase 9 (Feuille) : 9a/9b/9c livrés (montée de niveau en bouton, pas en
  modale). Restent 9.1 (édition par blocs), 9.2 (pickers), 9.3 (journalisation
  des modifications en séance).

Phases réellement **non commencées** :

- **7.1 / 7.2** — Inventaire & échanges (les schémas WS `inv.add/give/drop`
  existent dans `shared/ws-validation.ts` mais les handlers DO ne sont pas
  implémentés ; pas d'onglet Inventaire).
- **10.1–10.5** — Finitions : passe DS, robustesse, export JSON, **déploiement
  prod** (D1/R2/DO remote, secrets Discord, domaine), et **README** (toujours
  absent).

## 7. Reste à faire de l'audit du 06/09 (`audit-herosetdragons-2026-09-06-v2.md`)

Faits : B1–B6, N1–N4, S1, S2, S3, S5, S6, P1, P2 (client). Il reste :

- **P3 (partiel)** — plafond glissant côté client sur `tableStore.journal` et
  `olderEntries` (le Set d'ids est fait, le plafond mémoire non). Pas
  d'archivage R2 ni de politique de rétention décidée (la rétention DO est un
  `trimJournal` à 5 000 lignes).
- **P4** — cache de `createAuth()`, échappement des jokers `LIKE`, keepalive WS
  (`setWebSocketAutoResponse`), plafond de reconnexion.
- **Tests manquants** — REST sur `requireMemberOf` / `consumeInvitation`,
  visibilité compendium (le fix B4 n'a pas de test), session à deux navigateurs.

## 8. Conventions de code

- TypeScript strict partout, `verbatimModuleSyntax` (imports de types
  explicites), `noUncheckedIndexedAccess` (les accès tableau/objet peuvent être
  `undefined` — le code le gère).
- **Aucun commentaire ajouté** sauf demande explicite.
- Messages de commit en français, format conventionnel : `type(portée) : résumé`,
  corps détaillé si le changement est important.
- Formatage et lint automatiques : `oxfmt` et `oxlint`. Ne jamais committer sans
  `pnpm check` vert.
- Ne pas committer sans demande explicite de l'utilisateur.

## 9. Leçons / pièges connus

- **`shared/dist` doit être reconstruit** après toute modif de `shared/src/`
  (les autres workspaces lisent le dist, pas les sources).
- **Drizzle-kit ne résout pas les exports ESM-only** de `@rollwith/shared` sans
  la condition `require` dans `shared/package.json`.
- **Tests d'intégration DO** : `vitest-pool-workers` isole le storage par test,
  mais chaque test doit appeler `setupWorld()` lui-même (`applyD1Migrations`).
- **Visibilité des PNJ (B5)** : la règle est « un PNJ est visible si et
  seulement s'il a un pion révélé sur la carte active ». Toute nouvelle voie de
  diffusion (`broadcastRoleAware`, `broadcastJournal`, `buildSnapshot`) doit
  respecter ce filtre, sinon on réintroduit la fuite de noms.
- **CSP (S3)** volontairement permissive (`'unsafe-inline'`) pour ne pas casser
  le bootstrap SvelteKit ; c'est un garde-fou, pas une politique dure.
- **Commentaires de doc d'un `.svelte`** : tout texte placé **avant**
  `<script>` est du contenu rendu par Svelte (un `/** … */` en tête de fichier
  s'affiche sur la carte !). Les commentaires de composant vont **dans** le
  `<script lang="ts">`. Test e2e garde-fou dans « un joueur arrive sur la
  table ».
- **Instances `wrangler dev` orphelines** : deux workers sur le même SQLite de
  DO échouent en `SQLITE_BUSY`, et les lignes de commande réelles
  (`wrangler.js dev`, `wrangler-dist/cli.js dev`) ne matchent pas un
  `pkill -f "wrangler dev"`. Utiliser `pnpm dev:clean` (détection par ports
  `lsof` + arbres de processus, `--check` pour tester sans tuer) ; `pnpm dev`,
  `pnpm dev:all` et `pnpm e2e` l'appellent d'eux-mêmes.

## 10. Chantier d'UX/UI v2 — branche `feat/uiv2`

Un benchmark complet d'**Atlas VTT** (VTT pour Obsidian, AGPL) a été fait pour
refaire l'UX/UI de la table : carte centrale, panneaux flottants, interface « de
jeu » plutôt que « web ». **Lots 0 à 6 livrés.** **Lot 7 quasi complet** : feuilles de
PNJ réservées au MJ (API + tests), compendium en **grande fenêtre par-dessus la
table**, **fiche en panneau flottant** et **accueil** avec sélecteur de
personnage (les routes `/compendium` et `/characters/:id` restent pour les liens
directs) ; reste la surbrillance des modifications de feuille, reportée.
**Lot peaux Penpot entamé** : TargetFrame partagé livré (cible MJ filtrée B5).
Référence : `docs/atlas-benchmark/10-lot-peaux-penpot.md`.

| Document                                             | Contenu                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/atlas-benchmark/README.md`                     | **Point d'entrée.** §0 = décisions et validations, §1 = verdict                                             |
| `docs/atlas-benchmark/07-parcours-implémentation.md` | Les 9 lots, dépendances, risques, recette                                                                   |
| `docs/atlas-benchmark/05-architecture-svelte.md`     | Décisions techniques, dont DOM vs WebGL                                                                     |
| `docs/atlas-benchmark/06-design-system.md`           | Le système de surfaces (`<Surface>`, rayons, z-index)                                                       |
| `docs/brouillard-optimisation.md`                    | Ticket **indépendant**, à faire sur `main`                                                                  |
| `docs/bibliotheque-avatars.md`                       | Feature dédiée : upload + cadrage carré + bibliothèque d'avatars de campagne                                |
| `docs/atlas-benchmark/10-lot-peaux-penpot.md`        | Lot ajouté (après 0-5) : peaux Penpot du chrome (GroupFrame, TargetFrame partagé, TopActions, fenêtres/dés) |

Règles du chantier :

1. **`main` reste intacte.** Tout le chantier d'UX vit sur `feat/uiv2`.
2. **Un lot = une branche.** Le plan le demande explicitement.
3. **Cible : PC de bureau, grand écran, clavier-souris.** Aucun travail
   responsive, aucun travail tactile.
4. **`pnpm check` et `pnpm e2e` verts à chaque commit.**

Déjà en place sur `feat/uiv2` : les lots 0 à 4, `bits-ui@2.19.3` et
`@lucide/svelte` dans `web/package.json`, le design system Penpot comme source
(`web/src/lib/ds/`), la caméra dans `web/src/lib/table/camera.svelte.ts`,
l'undo/redo dans le DO (`shared/src/undo.ts`, RPC `undo()`/`redo()` +
`POST /api/campaigns/:id/undo|redo`) et deux spikes validés (overlays 54/54 sur
Chromium/Firefox/Safari ; Lot 1 sur la vraie table).

⚠️ **La règle de visibilité PNJ (AGENTS §9) couvre les PV des pions** : le DO
envoie `pv/pvMax = null` à un joueur quand `pnjPvVisible=false` et filtre les
pions non révélés (B5). Le client ne doit jamais déduire ou afficher une barre
sans ces valeurs. Test e2e : « Pions vivants (Lot 3) ».

⚠️ **`web/src/routes/dev/overlays/` est un harnais jetable de spike.**
`adapter-static` le déploierait tel quel. Le supprimer avant toute mise en prod.

Trois pièges de développement, à respecter dès la première ligne (détaillés dans
`docs/atlas-benchmark/README.md` §0) : le CSS scopé Svelte ne s'applique pas au
contenu portalé ni aux éléments rendus par un composant de bibliothèque ; un
`setPointerCapture` sur un ancêtre capture tout le document ; `onOpenChange(true)`
précède l'insertion du DOM portalé.
