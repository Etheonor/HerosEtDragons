# RollWith H&D — Tasks

> **Document 3/3 — Implementation plan** (spec-driven development).
> Références : `requirements.md` (R1–R14) et `design.md` (§1–10).
> Règles d'exécution : suivre l'ordre des phases ; **test-first** pour tout ce qui vit dans
> `shared/` et `tools/ingest` ; chaque phase se termine par ses critères de sortie validés
> (`pnpm check` = oxlint + oxfmt + svelte-check + vitest, tout vert).

---

## Phase 0 — Fondations (design §1, §3)

- [x] **0.1** Init monorepo pnpm (`api/`, `web/`, `shared/`, `tools/ingest`), TS strict, Oxlint,
      Oxfmt, Vitest, scripts racine (`dev`, `check`, `deploy`).
- [x] **0.2** `wrangler.jsonc` : Worker `rollwith-hd`, bindings D1 `DB`, DO `GAME_TABLE`
      (classe `GameTableDO`, migration new_sqlite_classes), R2 `MAPS`, `[assets]` avec fallback SPA,
      `run_worker_first` sur `/api/*`. Vérifier `wrangler dev` sert un Hono hello + une page Svelte.
- [x] **0.3** SvelteKit `adapter-static`, `ssr=false`, build intégré au dossier assets du Worker ;
      `tokens.css` + fontes dans `app.html` (design §9).
- [x] **0.4** Drizzle + D1 : config, première migration vide, `pnpm db:generate` / `db:migrate`
      (local + remote).

**Sortie** : `pnpm dev` = app SPA vide stylée papier + `/api/health` OK, CI locale verte.

## Phase 1 — Domaine pur `shared/` (R2, R6, R8, R9 — test-first)

- [x] **1.1** Tests puis implémentation `rules.ts` : mod, bonus de maîtrise/niveau, sauvegardes,
      compétences (les 18 H&D + carac de référence), perception passive, DD/attaque de sorts,
      seuils d'XP (R2.2).
- [x] **1.2** Tests puis `dice.ts` : parse `/XdY±Z` (bornes R6.3), somme + détail, détection
      critique/échec critique 1d20 (R6.4). Le RNG est injecté (interface) pour les tests.
- [x] **1.3** Tests puis `initiative.ts` : tri décroissant + départage stable (R8.7).
- [x] **1.4** Tests puis `inventory.ts` : fusion par nom insensible à la casse, validation de solde
      po/pa/pc sans conversion, transferts (R9).
- [x] **1.5** `types.ts` + `protocol.ts` : `Character` (sources uniquement), `Npc`,
      `CompendiumEntry`, messages WS client/serveur + snapshot (design §5), avec type guards testés.

**Sortie** : couverture complète des cas limites (12→+1, niv 5→+3, `/21d6` rejeté, égalités d'init…).

## Phase 2 — Auth & campagnes (R1)

- [x] **2.1** Schéma Drizzle : tables Better Auth + `allowed_users`, `invitations`, `campaigns`,
      `members` (design §4) ; migration.
- [x] **2.2** Better Auth + Discord dans Hono (`/api/auth/*`), hook whitelist/invitation (design §8).
- [x] **2.3** Routes campagnes : créer (→ MJ), lister les miennes, détail, settings
      (`pnjPvVisible`, `sheetsLocked`, `diceDuration`, `tokenSize`), générer une invitation,
      `/join/:token` (R1.2–R1.3).
- [x] **2.4** Middlewares `requireAuth` / `requireMember` / `requireMj` (implémentés) ; ⚠ tests
      d'accès refusé dédiés à écrire (R13.5).
- [x] **2.5** Front : `/login`, page d'accueil (mes campagnes, créer/rejoindre), shell layout DS
      (SketchyBox, boutons, chips — design §9).

**Sortie** : deux comptes Discord de test, une campagne, un MJ + un joueur membre.

## Phase 3 — Personnages & feuille (lecture + jets locaux différés) (R2, R10.1–R10.4)

- [x] **3.1** Schéma `characters` (colonnes chaudes pv/pvMax/pvTemp/conditions + `sheet` json) ;
      seed d'un PJ complet de démo (Kaelith niv. 5) pour développer la feuille.
- [x] **3.2** Routes characters : CRUD (propriétaire/MJ), liste par campagne, `active`.
- [x] **3.3** Feuille `/characters/[id]` **en lecture** : 4 colonnes du prototype (en-tête, caracs,
      sauvegardes/compétences, combat, traits/équipement), dérivés via `shared/rules.ts`,
      `showSpells` auto (non-lanceur), design DS strict (R10.1, R12).
- [x] **3.4** Interactions directes : PV −/+, PV temporaires, inspiration via API REST (R10.3) ;
      ⚠ jets contre la mort, emplacements de sorts, dés de vie restent à câbler ; PV pas encore
      rebranché WS (voir 4.6).

**Sortie** : la feuille de Kaelith rend pixel-proche du prototype, tous dérivés justes.

## Phase 4 — GameTableDO : cœur temps réel (R6, R7, R13)

- [x] **4.1** Classe `GameTableDO` : accept WebSocket (hibernation + attachment
      `{userId, role, charId}`), handshake `snapshot`, présence, storage SQLite du DO (design §5).
- [x] **4.2** Client WS `web/lib/ws.ts` : connexion, reconnexion + re-snapshot (R13.3), dispatch vers
      stores runes.
- [x] **4.3** Journal : table D1, append depuis le DO, tail dans le snapshot, `chat.say`,
      commande `/XdY±Z` (R7).
- [x] **4.4** Moteur de dés serveur (`crypto.getRandomValues` + `shared/dice`) : `dice.roll`,
      carte de jet au journal, message `dice.result` → **dé animé** overlay chez le lanceur (R6.5,
      clip-paths + faces 75 ms, durée réglable).
- [x] **4.5** Onglet Dés (modificateur, grille 6 dés, historique 6 jets) + dés rapides de la barre de
      session (R6.2, R6.7).
- [ ] **4.6** ⚠ Partiel : `char.hp` existe côté DO (write-through D1 + broadcast `delta`) mais la
      feuille (`CharacterSheet.svelte`) appelle encore l'API REST (`PATCH /pv`) au lieu du WS —
      pas de sync temps réel depuis la feuille pour l'instant. Jets de la feuille → `dice.roll` +
      toast pas câblés (R10.2). À reprendre si besoin, sinon accepté tel quel pour la suite.

**Sortie** : deux navigateurs connectés voient chat et jets synchronisés (`pnpm check` vert,
136 tests) ; PV synchronisés uniquement depuis l'écran de jeu (pas encore depuis la feuille).

## Phase 5 — Écran de jeu : compagnie + carte (R3, R4, R5)

- [x] **5.1** Layout 100vh 3 zones + barre de session (bascule mode, dés rapides, lien compendium,
      présence) (R3).
- [x] **5.2** Colonne Compagnie : cartes PJ (fond lignes de cahier, HpBar, −/+ selon permissions,
      états avec tooltip, « feuille ↗ ») et PNJ compactes (✕ MJ, `pnjPvVisible`) ; message « tombe à
      0 PV ! » (R4). États codés en dur (13 états du prototype) en attendant le compendium (phase 8).
- [x] **5.3** Cartes : CRUD méta + **upload image → R2** (`api/src/routes/maps.ts`, limites R14.4 :
      8 Mo, png/jpg/webp), sélecteur MJ, quadrillage par défaut, `map.select` broadcast (R5.1).
- [x] **5.4** Pions : rendu (bordures sketchy, couleurs, étiquettes Caveat), drag pointer-events en %,
      clamp, permissions, optimisme local (`dragOverride`), journalisation des déplacements (R5.2).
      PJ actifs auto-placés sur la carte à la sélection ; un pion par personnage (`tokenId === charId`).
- [x] **5.5** PNJ : ajout à la volée (outil + PNJ, champs nom/PV/CA/init dans la barre d'outils),
      suppression, pion auto posé au clic (R5.7 partiel — ajout depuis une fiche monstre = phase 8).
- [x] **5.6** Repères ⚑ (pose ✎ + texte, drag MJ, ✕ avec stopPropagation, effacer tout) et **pings**
      double-clic (`hdPing`, tous rôles) (R5.3–R5.4).
- [x] **5.7** Barre outils MJ complète (cartes, import, ✥/+PNJ/✎/▒ exclusifs, hints manuscrits) (R5.6).
- [x] **5.8** **Brouillard** : état par carte persistant dans le DO (`ctx.storage`), canvas overlay
      (aplat + hachures, trous radiaux dégradés, opacité 0,45 MJ / 1 joueur), glisser-pour-dévoiler,
      tout recouvrir / dissiper, **filtrage serveur des pions PNJ non révélés** par distance aux zones
      dévoilées, appliqué au snapshot et aux deltas (R5.5, design §5).

**Sortie** : `pnpm check` vert (136 tests, 0 erreur lint/type) ; Worker démarre et sert
`/api/health` + SPA sans erreur (`wrangler dev` smoke-testé). ⚠ Non vérifié en conditions réelles :
partie à deux navigateurs/rôles avec vraie session Discord (OAuth non simulable ici) — à valider
manuellement avant de considérer la phase définitivement close.

## Phase 6 — Combat & initiative (R8)

- [x] **6.1** `mode.set combat` → phase `init` : participants (pion + pv>0), init PNJ auto silencieuse
      (`handleModeSet`, `game-table.ts`). Cas limite géré : aucun participant → message d'erreur, pas
      de bascule ; que des PNJ → bascule immédiate en `run`.
- [x] **6.2** Bandeau combat : boutons « ✦ Nom lance son initiative ! » (actif soi/MJ, dashed sinon),
      `initiative.roll` serveur animé + journalisé, chips de scores au fil de l'eau (R8.3–R8.4).
- [x] **6.3** Passage `run` : ordre `shared/initiative` (`sortInitiative`), message « Initiative
      complète… », chip active, mise en évidence carte + pion (double anneau déjà en place depuis la
      phase 5), **Tour suivant →** MJ, rounds (R8.5).
- [x] **6.4** Fin de combat par retour Exploration ; cas limites : PNJ ajouté en cours de combat
      rejoint l'initiative (`addLateParticipant`, réinsertion dans l'ordre sans changer le tour actif),
      PNJ retiré en combat nettoyé de l'ordre (`removeParticipant`), joueur déconnecté → le MJ lance
      pour lui (règle de permission `role==='mj' || charId===att.charId`). Participant à 0 PV : reste
      dans l'ordre (pas de saut automatique), au MJ de gérer via Tour suivant.

**Sortie** : `pnpm check` vert (136 tests) ; build complet OK. ⚠ Non vérifié en conditions réelles
(combat à 3+ personnages sur deux navigateurs) — logique testée par lecture de code et smoke-test
serveur uniquement, à valider manuellement.

## Phase 7 — Inventaire & échanges (R9)

- [ ] **7.1** Onglet Inventaire : sélecteur de sac (verrouillé joueur / libre MJ), bourse, liste
      ×quantité.
- [ ] **7.2** Actions DO : `inv.add` (fusion), `inv.drop`, `inv.give` objet ×1, `inv.give` argent
      avec vérification de solde — atomiques, journalisées (R9.2–R9.5).

**Sortie** : échanges croisés simultanés depuis deux clients sans incohérence.

## Phase 8 — Compendium (R11)

- [ ] **8.1** Tests puis parser `tools/ingest` : frontmatter en tableaux markdown (imbriqués), corps
      en sections, sur fixtures réelles du DRS (aboleth, agrandir-retrecir, une classe, une arme).
- [ ] **8.2** Normalisation par catégorie (`meta` typé), visibilité par catégorie, résolution des
      liens internes, `searchText` (design §7).
- [ ] **8.3** Hash/diff + sortie SQL batch `wrangler d1 execute` ; rapport (ajouts/modifs/échecs de
      parsing → gabarit générique) ; ré-ingestion idempotente, homebrew intouché (R11.1).
- [ ] **8.4** Ingestion complète du DRS en local puis remote ; contrôle d'échantillons par catégorie.
- [ ] **8.5** API compendium : liste par catégorie (compteurs), fiche, recherche globale — visibilité
      appliquée **serveur** (R11.3, R11.9).
- [ ] **8.6** Écran 3 colonnes + gabarits `MonsterSheet` / `SpellSheet` / `GenericSheet`, ✒ sur les
      catégories MJ, liens internes cliquables (R11.4).
- [ ] **8.7** Intégrations : « poser sur la carte (PNJ) » pré-rempli (R11.5) ; **tooltips** états/
      sorts/termes liés sur compagnie, feuille et journal (R11.6) ; « partager au journal » +
      révélation de fiche, option partielle (R11.7).
- [ ] **8.8** Homebrew MJ : création/édition au même schéma, privé par défaut, publiable (R11.8).

**Sortie** : recherche « aboleth » invisible côté joueur tant que non partagée ; PNJ posé depuis la
fiche avec PV/CA/init corrects.

## Phase 9 — Feuille : édition, création, montée de niveau (R10.5–R10.10)

- [ ] **9.1** Mode « ✎ éditer » par bloc : inputs sketchy, listes avec « + hop » / ✕ / drag,
      validation (sources uniquement), autorisations propriétaire+MJ, verrou `sheetsLocked` (R10.5,
      R10.6, R10.10).
- [ ] **9.2** Saisie assistée : pickers compendium (arme, sort, capacité, race, classe, historique)
      qui pré-remplissent sans écraser une saisie manuelle (R10.7).
- [ ] **9.3** Journalisation des modifications en séance (« CA 17 → 18 ») via notification du DO
      (design §5, R10.10).
- [ ] **9.4** Assistant de création 5 étapes (race → classe → caracs → historique → équipement)
      alimenté par le compendium, sortie = même modèle (R10.8).
- [ ] **9.5** Montée de niveau : modale dédiée, gains proposés (PV, capacités, sorts, maîtrise),
      tout ajustable (R10.9).

**Sortie** : créer un perso de zéro via l'assistant, le monter niveau 2, jouer avec sur la table.

## Phase 10 — Finitions & mise en production

- [ ] **10.1** Passe DS globale : radius sketchy variés, annotations Caveat, glyphes autorisés
      uniquement, densités (compendium dense / jeu aéré) (R12).
- [ ] **10.2** Robustesse : reprise WS (réseau coupé), messages `error` affichés, garde-fous quotas
      (taille upload, longueur chat).
- [ ] **10.3** Export JSON de campagne (nice-to-have R14.5).
- [ ] **10.4** Déploiement prod : D1/R2/DO remote, secrets Discord, domaine, migrations remote,
      ingestion DRS remote ; smoke test à deux vrais comptes.
- [ ] **10.5** README (setup, commandes, ré-ingestion DRS) + copie de `CLAUDE.md` (guardrails
      design §10 + DS) à la racine du repo.

---

## Récapitulatif de couverture

| Exigence | Phases     |
| -------- | ---------- |
| R1       | 2 · R2     | 1, 3 · R3  | 5 · R4  | 5 · R5         | 5 · R6         | 1, 4 · R7 | 4 · R8 | 1, 6 |
| R9       | 1, 7 · R10 | 3, 9 · R11 | 8 · R12 | 0, 5, 10 · R13 | 4, 5, 10 · R14 | 0, 10     |
