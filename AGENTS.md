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

## 5. Documentation existante (`docs/`)

| Document                                      | Contenu                                           | État                               |
| --------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `requirements.md`                             | Spec fonctionnelle R1–R14                         | référence                          |
| `design.md`                                   | Architecture §1–§10 (schéma D1, protocole WS, DS) | référence                          |
| `tasks.md`                                    | Plan d'implémentation phases 0–10                 | **périmé** (juil. 2026) — voir §6  |
| `HANDOFF-2026-09-05.md`                       | État complet au 05/09, pièges, reste à faire      | historique                         |
| `audit-2026-08-30.md` / `audit-2026-09-05.md` | Audits successifs                                 | historiques                        |
| `audit-herosetdragons-2026-09-06-v2.md`       | **Audit de référence** (celui traité en sept.)    | §6 non mis à jour après correctifs |
| `compendium-mapping.md`                       | Mapping DRS → catégories                          | référence                          |

## 6. ÉcartsKnown entre `tasks.md` et la réalité

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
