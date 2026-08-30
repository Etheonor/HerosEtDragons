# RollWith H&D — Design

> **Document 2/3 — Design** (spec-driven development).
> Répond au **COMMENT** des exigences de `requirements.md` (référencées `R1`…`R14`).
> Le découpage en tâches est dans `tasks.md`.

---

## 1. Stack retenue

| Couche     | Technologie                                                                                                                   | Décision / justification                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime    | **Cloudflare Workers** (1 seul Worker)                                                                                        | Zéro serveur à opérer, tiers gratuit large. Plan **Workers Paid (5$/mois)** requis pour les Durable Objects SQLite — accepté (R14.1).                |
| API        | **Hono** (monté sur `/api/*`)                                                                                                 | Idiomatique Workers, RPC typé côté client.                                                                                                           |
| Temps réel | **Durable Objects** (classe `GameTableDO`, une instance par campagne)                                                         | WebSockets + état autoritaire mono-thread par table : concurrence triviale, jets serveur, hibernation = coût quasi nul hors session. Remplace Redis. |
| Front      | **SvelteKit** en **SPA statique** (`adapter-static`, `ssr = false`) servie par le binding `[assets]` du Worker (fallback SPA) | Pas de SEO (app privée), pas de fichiers serveur SvelteKit. Même pattern que GW2 Iron.                                                               |
| Auth       | **Better Auth** + provider **Discord**                                                                                        | Comme GW2 Iron. Sessions cookie, adaptateur Drizzle/D1.                                                                                              |
| DB         | **D1** (SQLite) + **Drizzle ORM**                                                                                             | Remplace PostgreSQL. Les champs flexibles (feuille, meta compendium) en colonnes `text { mode: 'json' }`.                                            |
| Assets     | **R2** (images de cartes)                                                                                                     | Servi via route Worker authentifiée.                                                                                                                 |
| Recherche  | SQL (LIKE + colonnes indexées) sur D1                                                                                         | Suffisant pour ≈ 3 000 fiches ; FTS5 en option si besoin.                                                                                            |
| Toolchain  | pnpm workspaces, TypeScript strict, **Oxlint + Oxfmt**, svelte-check, **Vitest** (unit, pur), Wrangler                        | Aligné GW2 Iron.                                                                                                                                     |

Retirés par rapport à la stack initiale : **PostgreSQL** (→ D1), **Redis** (→ DO), hébergement
Hetzner/Coolify (→ Cloudflare). SvelteKit SSR : **désactivé** (guardrail §10).

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker "rollwith-hd"                  │
│                                                                     │
│  fetch()                                                            │
│   ├── /api/auth/*        → Better Auth handler (Discord OAuth)     │
│   ├── /api/campaigns/*   → Hono (CRUD campagnes, membres, invits)  │
│   ├── /api/characters/*  → Hono (feuilles : lecture/édition/créa)  │
│   ├── /api/compendium/*  → Hono (liste, fiche, recherche, homebrew)│
│   ├── /api/maps/*        → Hono (upload → R2, GET image)           │
│   ├── /api/tables/:campaignId/ws → forward vers GameTableDO ───┐   │
│   └── /* → Static Assets binding (SPA Svelte, fallback index)  │   │
│                                                                 ▼   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GameTableDO (1 par campagne)                                 │  │
│  │  · WebSockets (hibernation API) + présence                   │  │
│  │  · état live : pions, repères, brouillard, combat, carte     │  │
│  │    active, pings — dans le storage SQLite du DO              │  │
│  │  · moteur de dés (crypto), initiative, tours                 │  │
│  │  · écrit le durable dans D1 : journal, PV/états, inventaires │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Bindings : DB (D1) · GAME_TABLE (DO) · MAPS (R2) · ASSETS · vars  │
└────────────────────────────────────────────────────────────────────┘
```

**Partage des responsabilités état** (R13) :

| Donnée                                                | Autorité                                           | Persistance                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pions, repères, brouillard, carte active, mode/combat | `GameTableDO`                                      | DO storage (SQLite), write-through à chaque mutation                                                    |
| Pings, présence                                       | `GameTableDO`                                      | Éphémère (mémoire)                                                                                      |
| Journal, jets                                         | `GameTableDO` (émission)                           | **D1** (append) + cache des N derniers dans le DO                                                       |
| Personnages (feuille, PV, états, inventaire)          | API Hono **et** DO (PV/états/inventaire en séance) | **D1** — le DO écrit dans D1 puis broadcast ; l'API notifie le DO après une édition de feuille (RPC DO) |
| Campagnes, membres, cartes (méta), compendium         | API Hono                                           | D1 (+ R2 pour les images)                                                                               |

Règle : **une seule autorité par donnée à un instant donné.** Les mutations de séance (PV, états,
inventaire, pions…) passent toutes par le DO via WebSocket ; les éditions de feuille passent par
l'API REST qui appelle `stub.notifyCharacterUpdated(id)` pour resynchroniser les clients connectés.

## 3. Monorepo

```
rollwith-hd/
├── package.json / pnpm-workspace.yaml / oxlint.jsonc / .oxfmtrc
├── wrangler.jsonc              # worker + DO + D1 + R2 + assets
├── api/
│   └── src/
│       ├── index.ts            # export default { fetch } + export GameTableDO
│       ├── auth.ts             # Better Auth (Discord, whitelist/invitations)
│       ├── db/schema.ts        # Drizzle (D1)
│       ├── routes/             # campaigns, characters, compendium, maps
│       └── do/
│           ├── game-table.ts   # GameTableDO : ws, état, handlers de messages
│           └── live-state.ts   # (dé)sérialisation snapshot, write-through
├── web/
│   └── src/
│       ├── routes/             # /, /campaigns/[id]/table, /characters/[id], /compendium
│       ├── lib/
│       │   ├── api.ts          # client RPC Hono + fetch
│       │   ├── ws.ts           # client WebSocket (reconnexion, dispatch)
│       │   ├── stores/         # état table (Svelte 5 runes) hydraté par snapshot+deltas
│       │   ├── ds/             # design system : tokens.css + composants
│       │   └── components/     # compagnie, carte, panneau, feuille, compendium…
│       └── app.html
├── shared/
│   └── src/
│       ├── rules.ts            # ⌊(v−10)/2⌋, maîtrise/niveau, DD sorts, XP… (R2.2)
│       ├── dice.ts             # parse `/XdY±Z`, bornes, format détail
│       ├── initiative.ts       # tri + départage (R8.7)
│       ├── inventory.ts        # fusion, transferts (validation pure)
│       ├── protocol.ts         # types des messages WS client↔serveur + snapshot
│       └── types.ts            # Character, Npc, CompendiumEntry, …
└── tools/
    └── ingest/                 # pipeline DRS (script Node local, §7)
```

`shared/` ne contient que des **fonctions pures et des types** — testées en priorité (test-first,
cf. tasks). Ni le Worker ni le front n'importent quoi que ce soit de `tools/`.

## 4. Modèle de données D1 (Drizzle)

```
users, sessions, accounts, verification   -- tables Better Auth (adapter Drizzle)
allowed_users(discordId pk, note)          -- whitelist R1.1
invitations(token pk, campaignId, usesLeft, expiresAt)

campaigns(id pk, name, ownerId → users, settings json, createdAt)
   -- settings : { pnjPvVisible: bool, sheetsLocked: bool, diceDuration, tokenSize }
members(campaignId, userId, role 'mj'|'player', pk(campaignId,userId))

characters(id pk, campaignId, ownerId nullable,   -- null = PNJ
           kind 'pj'|'pnj', name, color, active bool,
           sheet json,        -- modèle R2.3 complet (sources uniquement)
           pv, pvMax, pvTemp, conditions json,     -- colonnes chaudes hors json
           updatedAt)

maps(id pk, campaignId, name, r2Key nullable, createdAt)

journal(id pk autoinc, campaignId, ts, kind 'say'|'system'|'roll'|'share',
        who, whoColor, text, roll json nullable, ref json nullable)
        idx(campaignId, id)

compendium(slug, category, pk(category,slug), title, source, sourcePage,
           meta json, body json, visibility 'public'|'mj',
           searchText,          -- nom + tags + méta aplatie, pour LIKE
           version, hash, isHomebrew bool, campaignId nullable)
           idx(category), idx(searchText)

table_state(campaignId pk, snapshot json, updatedAt)
   -- miroir de secours de l'état DO (exports/debug) ; l'autorité reste le DO
```

Choix : PV/états en **colonnes dédiées** (mutations fréquentes en séance, pas de réécriture du gros
`sheet`), le reste de la feuille en JSON. Les dérivés ne sont **jamais stockés** (R2.2) : ils sont
recalculés via `shared/rules.ts` des deux côtés.

## 5. GameTableDO — protocole temps réel

### Connexion

`GET /api/tables/:campaignId/ws` : le Worker vérifie session + appartenance (R13.5), puis forward au
DO (`idFromName(campaignId)`). Le DO utilise l'**hibernation API** (`acceptWebSocket`,
`serializeAttachment` pour `{userId, role, charId}`) → coût nul entre les messages.

À l'accept : le DO envoie `{type:'snapshot', state, journalTail, presence}` (R13.3). Le client
hydrate ses stores puis n'applique que des deltas.

### Messages (extrait de `shared/protocol.ts`)

```ts
// client → serveur (le serveur revalide TOUT : rôle, propriété, bornes)
{type:'token.move', tokenId, x, y}                  // % clampés
{type:'char.hp', charId, delta}                     // ±
{type:'char.condition', charId, cond, on}           // MJ
{type:'npc.add', name, pv, ca, init} | {type:'npc.addFromMonster', slug} | {type:'npc.remove', charId}
{type:'map.select', mapId} | {type:'marker.set'|'marker.move'|'marker.remove', …} | {type:'marker.clear'}
{type:'fog.enable'} | {type:'fog.reveal', x, y} | {type:'fog.cover'} | {type:'fog.disable'}
{type:'ping', x, y}
{type:'mode.set', mode:'exploration'|'combat'}      // MJ ; combat → phase init (R8)
{type:'initiative.roll', charId}                    // soi-même, ou MJ en secours
{type:'combat.next'}                                // MJ
{type:'chat.say', text}                             // /XdY±Z détecté serveur
{type:'dice.roll', sides, n, mod, label?}           // quick dice + feuille (R6)
{type:'inv.give', from, to, money?|item?} | {type:'inv.add'|'inv.drop', …}

// serveur → clients
{type:'snapshot', …}
{type:'delta', patch}            // mutations d'état live (pions, fog, combat, carte…)
{type:'journal', entry}          // inclut les cartes de jet
{type:'dice.result', forUserId, anim:{sides, faces[], total, detail}}  // anime chez le lanceur
{type:'char.updated', charId}    // → refetch REST de la feuille
{type:'presence', users[]}
{type:'error', code, msg}
```

### Règles serveur

- **Permissions** appliquées dans le DO d'après l'attachment (table R1/§1.2 du récap) — jamais
  d'après ce que dit le client.
- **Dés** : `crypto.getRandomValues` (rejection sampling), détail conservé (faces individuelles),
  critiques détectés sur 1d20 (R6.4). Le client ne reçoit jamais un jet à exécuter, seulement un
  résultat à animer.
- **Brouillard** : le DO stocke `{on, reveals:[{x,y}]}` par carte. Les deux rôles reçoivent les mêmes
  données (rendu différencié client, R5.5) — acceptable ici : le brouillard cache le **fond de carte**,
  déjà connu du client. Les **pions PNJ sous brouillard non révélé ne sont pas envoyés aux joueurs**
  (filtrage serveur par distance aux reveals) pour ne rien laisser deviner.
- **Inventaire** : transferts validés et appliqués atomiquement dans le DO (mono-thread) puis écrits
  en D1 (R9.5).
- **Écritures D1** : journal en append immédiat ; PV/états/inventaire en write-through ; état live
  dans le storage du DO à chaque mutation (R13.4).

## 6. Front SvelteKit

- **Routes** : `/` (campagnes) · `/campaigns/[id]/table` (écran de jeu R3–R9) ·
  `/characters/[id]` (feuille R10, `?edit` par bloc) · `/characters/new` (assistant R10.8) ·
  `/compendium[/[category]/[slug]]` (R11) · `/login`.
- **Stores runes** : `tableState` (hydraté snapshot + deltas), `journal`, `presence`, `me` ;
  actions = envoi WS + optimisme limité (drag de son pion : position locale immédiate, le delta
  serveur fait foi).
- **Carte** : conteneur positionné, pions/repères en `%`, pointer events (comme le prototype) ;
  brouillard sur `<canvas>` plein cadre `pointer-events:none` (aplat `#3B372E` + hachures, trous
  `destination-out` radiaux r≈68px, opacité 0,45 MJ / 1 joueur), redessiné sur delta et resize.
- **Dé animé** : overlay (clip-path par type de dé, faces 75 ms, durée = réglage campagne), déclenché
  par `dice.result` chez le lanceur ; toast équivalent sur la feuille.
- **Feuille** : composants par colonne ; mode édition par bloc → inputs sketchy ; les champs assistés
  ouvrent un picker compendium (recherche) qui pré-remplit sans jamais écraser une saisie manuelle
  (R10.7) ; création = wizard 5 étapes ; montée de niveau = modale dédiée (diff proposé → ajustable).
- **Compendium** : 3 colonnes ; gabarits `MonsterSheet`, `SpellSheet`, `GenericSheet` ; tooltip =
  même composant fiche en mode `mini` ; actions contextuelles selon rôle (poser PNJ / partager /
  ajouter à une feuille).

## 7. Pipeline d'ingestion DRS (`tools/ingest`)

Script **Node local** (pas dans le Worker), ré-exécutable (R11.1) :

1. `git clone/pull` de `igwane/heros-et-dragons-drs`.
2. Pour chaque `docs/<cat>/<slug>/README.md` : parse du frontmatter en **tableaux markdown**
   (parser dédié, tableaux imbriqués `abilityScores`, `ac`, `movement`…) + corps en sections
   `{heading, paras}`.
3. Normalisation vers le schéma canonique (`meta` typé par catégorie, R11.2) + `visibility` par
   catégorie (R11.3).
4. Résolution des liens internes relatifs → `compendium://cat/slug` (rendus en liens/tooltips côté
   front).
5. `searchText` = titre + tags + méta aplatie (minuscules, sans accents).
6. `hash` = sha256 du contenu normalisé ; comparaison avec l'existant → rapport de diff
   (ajouts/modifs/suppressions) ; jamais de touche au homebrew (`isHomebrew=1`).
7. Sortie : SQL batch appliqué via `wrangler d1 execute` (local puis `--remote`).

Les fiches irrégulières qui résistent au parsing sont listées dans le rapport et ingérées en gabarit
générique (body seul) plutôt que de faire échouer le pipeline.

## 8. Auth (Better Auth)

- Provider Discord ; adapter Drizzle/D1 ; cookies `Secure` `SameSite=Lax`.
- Hook `signIn` : refus si `discordId` absent de `allowed_users` **et** pas de token d'invitation
  valide en cours (flux : `/join/:token` stocke le token, l'accepte à la volée, décrémente
  `usesLeft`, ajoute à `allowed_users` et à `members`).
- Middleware Hono `requireAuth`, `requireMember(campaignId)`, `requireMj(campaignId)`.

## 9. Design system (implémentation)

- `web/src/lib/ds/tokens.css` : variables CSS des couleurs/pas de grilles du R12.1 ; fontes Google
  (Cormorant Garamond, Spectral, Caveat, IBM Plex Mono) préchargées dans `app.html`.
- Composants : `SketchyBox` (bordure 2px encre + radius sketchy **déterministe** :
  `sketchyRadius(seed)` génère les 8 valeurs à partir de l'id de l'élément → variation stable entre
  rendus, R12.3), `BtnPrimary/Ink/Secondary/Ghost`, `Chip`, `HpBar` (hachures), `Annotation` (Caveat
  carmin rotaté), `SketchyInput/Select` (focus = bordure carmin), `Tabs`, `Placeholder`.
- La contrainte « styles inline uniquement » du prototype **ne s'applique pas** au produit : classes +
  variables CSS, mais rendu strictement identique.
- Keyframes globales : `hdPing`, défilement de faces du dé.

## 10. Guardrails pour Claude Code

1. **SvelteKit reste `adapter-static` + `ssr=false`** : aucun `+page.server.ts`, `+server.ts` ni
   `hooks.server.ts`. Tout le serveur vit dans `api/`.
2. **Un seul Worker**, un seul point d'entrée `api/src/index.ts` (fetch + export du DO). Pas de
   script de build custom.
3. **Aucun jet de dés côté client.** Toute mutation d'état de table passe par le DO.
4. La **visibilité compendium** est appliquée dans les requêtes API, jamais seulement dans l'UI.
5. Les **dérivés ne sont jamais stockés** ; toute règle 5E vit dans `shared/rules.ts` (pur, testé).
6. `shared/` : fonctions pures + types uniquement (pas d'import Workers/DOM).
7. Textes UI en **français** ; glyphes autorisés uniquement ⚔ ✦ ⚑ ✥ ✎ ▒ ✕ ➤ 🥾 ✒.
8. Respect strict des tokens du DS ; aucune couleur hors palette.
9. Tests Vitest obligatoires **avant implémentation** pour `shared/` (rules, dice, initiative,
   inventory, protocol guards) et pour le parser d'ingestion.
10. Migrations Drizzle versionnées (`drizzle-kit generate`), jamais de SQL ad hoc en prod.
