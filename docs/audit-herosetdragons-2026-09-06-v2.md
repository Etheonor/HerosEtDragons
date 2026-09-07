# Audit — HérosEtDragons (rollwith-hd), version à jour

_6 septembre 2026 — périmètre : `api/`, `web/`, `shared/`, `tools/`, migrations, outillage._
_Remplace l'audit fait sur la version précédente du zip._

---

## 0. Verdict

La différence avec la version que j'avais auditée est spectaculaire. Un vrai sprint de fondations a été passé, et il a été bien passé :

| Chantier                                         | État vérifié dans le code                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type `CharacterSheet` canonique                  | ✅ `shared/src/sheet.ts` (Zod), `types.ts` supprimé, `api/db/schema.ts` et `web/lib/api.ts` importent le type. Les 3 copies divergentes ont disparu. |
| Validation des messages WS                       | ✅ `shared/src/ws-validation.ts` — union discriminée, `safeParse` avant dispatch, plus un seul `Number.isFinite(msg.x as number)` dans les handlers  |
| DTO REST partagés                                | ✅ `shared/src/dto.ts`, routes annotées `c.json<T>()`, client web sans redéfinition                                                                  |
| Middleware d'autorisation                        | ✅ `requireMemberOf(resolver)` + `requireMj` sur toutes les routes ; les ~200 lignes de `select members` dupliquées ont sauté                        |
| Tests d'intégration du DO                        | ✅ `api/test/game-table.test.ts`, 12 tests dans workerd avec D1 réel : combat, brouillard, PV masqués, RPC                                           |
| Store WS                                         | ✅ `ws.svelte.ts` en runes ; **la reconnexion fantôme au `disconnect()` est corrigée** ; backoff exponentiel + jitter                                |
| Lint                                             | ✅ `pnpm check` repasse (0 erreur, 12 warnings, tous dans `tools/`)                                                                                  |
| Découpe de la feuille                            | ✅ 1712 → 965 lignes + 4 sous-composants (`SheetCaracs`, `SheetSaves`, `SheetCombat`, `SheetTraits`)                                                 |
| `cleanupMap` à la suppression d'une carte        | ✅ RPC DO appelée par `DELETE /api/maps/:id`                                                                                                         |
| `nextRollIndex` (collision d'index d'initiative) | ✅ corrigé                                                                                                                                           |
| Snapshot non bloquant après le 101               | ✅ `afterUpgrade`                                                                                                                                    |
| Route de seed Kaelith                            | ✅ supprimée                                                                                                                                         |

Et la 9c a été livrée par-dessus (montée de niveau, armures, CA auto), avec la logique en pur testé dans `shared/`.

Sur les items que j'avais listés, ceux qui restent ouverts se comptent : le cache de settings du DO, les PV temporaires, la fuite compendium, les index D1, le throttle des pions, le rate limiting. C'est la deuxième moitié de la liste — celle qui demande une décision ou une migration, pas un refactoring.

**Chiffres actuels** : ~263 tests · plus gros fichiers `do/game-table.ts` 1881 l. et `table/+page.svelte` 1611 l. · lint vert.

---

## 1. Bugs toujours ouverts

### B1 — Le cache de settings du DO n'est jamais invalidé (haute)

`api/src/do/game-table.ts:163-171` · `api/src/routes/campaigns.ts:176`

```ts
private async ensureSettings(): Promise<TableSettings | null> {
  if (this.cachedSettings) return this.cachedSettings;   // ← jamais remis à null
```

`PATCH /api/campaigns/:id/settings` écrit dans D1 et s'arrête là. Seul `buildSnapshot` (`:1748`) rafraîchit le cache, c'est-à-dire à la connexion d'un nouveau socket. Conséquence en partie : le MJ coche « PV des PNJ visibles », et les joueurs déjà connectés continuent de recevoir `pv: null` jusqu'à ce qu'ils rechargent.

Vous avez déjà exactement le bon modèle à côté (`notifyCharacterUpdated`, `cleanupMap`) : un RPC `notifySettingsUpdated()` qui fait `this.cachedSettings = null` puis rediffuse, appelé par la route. C'est le même geste que celui qui a réglé B7.

### B2 — `pvAuto` est silencieusement perdu à la création (moyenne)

`api/src/routes/characters.ts:168-187` · `CharacterCreateModal.svelte:252` · `CharacterSheet.svelte`

Le wizard envoie `pvAuto: !pvEdited` — c'est-à-dire « le joueur a forcé ses PV à la main, ne les recalcule pas ». Le mapping vers `createSheet()` liste 18 champs et **oublie `pvAuto`, `caAuto`, `portrait`, `inspiration` et `deathSaves`**.

Résultat concret : un joueur qui ajuste ses PV max dans le wizard voit sa valeur écrasée par le calcul automatique dès la première ouverture de sa feuille (`pvAutoOn = sheet.pvAuto !== false`, et `undefined !== false` vaut `true`). C'est précisément la « règle d'or » du handoff (aucune action utilisateur ne doit déclencher un calcul) qui se retourne contre l'utilisateur.

Le mapping champ par champ est d'ailleurs la cause : `createSheet(body.sheet ?? {})` ferait le travail, puisque le builder applique déjà tous les defaults et que Zod a déjà borné l'entrée. Le seul override nécessaire est `identite.nom`.

### B3 — Les PV temporaires n'absorbent toujours pas les dégâts (moyenne, règle métier)

`api/src/do/game-table.ts:670` · `api/src/routes/characters.ts:232`

```ts
let newPv = char.pv + delta;
```

`pvTemp` est stocké, diffusé, éditable, affiché — et ignoré par les deux chemins de dégâts. En H&D comme en 5E, les dégâts entament les PV temporaires d'abord. Maintenant que `shared/` a une place naturelle pour ça et une infra de test qui couvre le DO, c'est une fonction pure (`applyDamage(pv, pvTemp, pvMax, delta)`), un test, et deux appels.

### B4 — Le compendium fuit toujours le homebrew des autres campagnes (moyenne)

`api/src/routes/compendium.ts:153-171`

`visibilityWhere(isMj, campaignId)` applique deux filtres : la visibilité **et** l'origine (`origin='drs' OR campaign_id = ?`). La route `/entry/:category/:slug` réimplémente la visibilité à la main pour y greffer la clause `compendium_shares`, et **n'applique pas le filtre d'origine**. La clé du compendium étant globale (`<category>/<slug>`), un membre de la campagne A qui connaît le slug d'une fiche maison de la campagne B la lit intégralement.

Sans conséquence aujourd'hui (les 1 579 fiches sont toutes `origin:'drs'`), mais ça devient une vraie fuite le jour où l'éditeur homebrew arrive — et c'est exactement le genre de trou qui ne se remarque jamais. Le correctif est de composer plutôt que de dupliquer : `and(visibilityWhere(isMj, campaignId), sharedOrPublic, eq(category), eq(slug))`.

### B5 — Le brouillard ne masque pas les noms de PNJ (haute — confirmé comme bug le 06/09)

Le pion d'un PNJ non révélé est bien filtré côté serveur (`filterTokensForPlayers:1707`), mais **tout le reste de son identité part quand même aux joueurs**. Il y a quatre canaux de fuite, et c'est ce qui rend le correctif moins trivial qu'il n'en a l'air :

1. **La carte de personnage.** `filterCharactersForPlayers:178` ne masque que `pv` et `pvMax`. `name`, `portrait`, `ca`, `conditions` et `initiativeBonus` partent intacts. Pire, `buildSnapshot` envoie la liste complète des personnages de la campagne à la connexion : un joueur qui se connecte connaît d'emblée tous les PNJ posés, révélés ou non.
2. **Le journal en direct.** Dix-huit `broadcastAll({ type: "journal" })`, aucun filtrage de rôle. Les entrées système nomment explicitement le PNJ : `✦ Le MJ ajoute Gobelin sur la carte.` (`:787`), `✦ Gobelin tombe à 0 PV !` (`:682`), `✦ Le MJ duplique Gobelin.` (`:1238`), `✦ Le MJ retire Gobelin.` (`:1076`), plus les jets d'initiative qui utilisent `char.name` comme auteur (`:1507`). Et `npc.addFromTemplate` nomme les copies `Gobelin A`, `Gobelin B`… ce qui donne aussi le compte.
3. **Le journal persistant.** Ces mêmes entrées sont écrites en D1 et resservies telles quelles par `getJournalTail()` et par `GET /api/campaigns/:id/journal`, sans aucun filtrage. Un simple rechargement de page rend tout l'historique lisible.
4. **L'état de combat.** `participants`, `order` et `scores` contiennent les ids de PNJ et partent par `broadcastAll` (`:1003`, `:1547`, `:1629`). Même cartes filtrées, le nombre de créatures et leur position dans l'ordre fuient.

**Design proposé.** Introduire une notion unique côté DO — un PNJ est visible par un joueur s'il a un pion sur la carte active **et** que ce pion est révélé — puis la faire porter par les quatre canaux :

- `visiblePnjIds()` calculé depuis `liveState` + `npcIds` (les deux sont déjà préchargés à l'entrée de chaque message, donc c'est synchrone, comme `filterTokensForPlayers`).
- `filterCharactersForPlayers` **omet entièrement** la carte hors de cet ensemble, au lieu de nuller deux champs.
- Corollaire important : la carte ne pouvant plus être envoyée dans le snapshot initial, il faut la **pousser au moment où la visibilité change** — `fog.reveal`, `fog.cover`, `fog.disable`, `token.move`, `map.select` — et envoyer `null` quand elle redevient cachée. C'est le vrai travail du chantier.
- `combat` passe par `broadcastRoleAware` au lieu de `broadcastAll`, avec `participants`/`order`/`scores` filtrés par destinataire.
- Journal : une colonne `visibility` (`'all' | 'mj'`, défaut `'all'`) sur la table `journal`. Les entrées système qui nomment un PNJ non révélé sont écrites en `'mj'`, ou reformulées génériquement (« une créature tombe à 0 PV »). Le filtre s'applique **des deux côtés** : `getJournalTail()` et la route REST paginée.

Compter 1 à 2 jours. Comme il impose une migration sur `journal`, il a tout intérêt à être fait **en même temps** que le chantier journal ci-dessous (P3) — une seule migration, une seule relecture de cette table.

### B6 — Broutilles

- `handleModeSet:1417` filtre les participants sur `pv > 0` et la présence d'un pion, mais pas sur `active` : un PJ désactivé qui a encore un pion entre dans l'initiative alors que l'UI ne l'affiche pas.
- `POST /api/campaigns` (`campaigns.ts:74`) est la dernière route sans `zValidator` : `name` n'a aucune borne de longueur. Toutes ses voisines sont passées au schéma, celle-là a été oubliée.
- `shared/src/validation.ts` est devenu **du code mort** : plus aucun import (`characterSheetSchema` est utilisé directement partout). Il garde 14 tests, qui donnent une couverture en trompe-l'œil sur un module que plus personne n'appelle. À supprimer avec ses tests, ou à rebrancher.
- `api/src/index.ts:25` transforme tout 5xx de better-auth en `redirect /login?denied=1`. Une panne D1 s'affiche donc « votre compte n'est pas autorisé ». Inchangé depuis le premier audit.

---

## 2. Points introduits par le refactoring

Ce ne sont pas des régressions graves, mais ce sont des choses que le sprint a créées et qu'il vaut mieux traiter avant qu'elles ne durcissent.

### N1 — Les bornes sont de nouveau dupliquées, côté client cette fois

`web/src/lib/components/CharacterSheet.svelte` → `normalized()`

Le gros du travail de l'audit précédent a été de faire de `characterSheetSchema` la source unique des bornes. Mais `normalized()` réencode ces mêmes bornes à la main sur ~130 lignes :

```ts
niveau: num(s.identite.niveau, 1, 20, 1),
ca: num(s.ca, 0, 40, 10),
initiativeBonus: num(s.initiativeBonus, -5, 20, 0),
```

Chaque nombre est déjà écrit dans `sheet.ts`. Le jour où une borne bouge côté schéma, le client envoie une valeur hors bornes et le `PUT` renvoie un 400 muet — le pire cas, parce que l'autosave affiche juste « Enregistrement impossible ».

C'est le même problème que D7 dans votre audit, déplacé d'un cran. La bonne forme : une fonction `normalizeSheet(sheet)` dans `shared/` qui clampe **à partir du schéma** (les bornes sont introspectables sur les `ZodNumber`, ou plus simplement extraites dans un objet `SHEET_BOUNDS` que le schéma et le clamp lisent tous les deux).

### N2 — Le résolveur de campagne coûte une requête D1 supplémentaire

`characters.ts:24` (`charCampaign`), `maps.ts:24` (`mapCampaign`), `npc-templates.ts:17` (`templateCampaign`)

Le middleware charge le `campaignId` de la ressource, puis le handler recharge la ligne complète. Un `GET /api/characters/:id` fait donc quatre allers-retours D1 : session, `account`, `campaignId` du personnage, puis le personnage.

Le refactoring a supprimé la duplication — c'est un gain net — mais il a payé une requête pour ça. Le correctif est mécanique : que le résolveur fasse un `select()` complet et pose la ligne via `c.set("character", row)`, que le handler relise depuis le contexte. Ça vaut aussi pour `requireAuth`, qui charge `account` sur **chaque** appel alors que `discordId` ne sert que dans `POST /campaigns/join/:token` — à rendre paresseux.

### N3 — Le garde-fou de taille sur `PUT /sheet` a disparu

Avant : `c.req.text()` puis `if (raw.length > 200_000) return 413`. Maintenant `zValidator("json", …)` parse le corps avant toute vérification. Zod borne bien chaque champ, mais le `JSON.parse` d'un corps de plusieurs mégaoctets a lieu quand même. Un contrôle de `Content-Length` en amont (un middleware de 5 lignes, applicable à toutes les routes JSON) rétablit la garde sans perdre le bénéfice du schéma.

### N4 — Détail Svelte

`table/+page.svelte:29` : `let store = $state(tableStore)` enveloppe dans un `$state` un objet qui est déjà un proxy `$state` (créé dans `ws.svelte.ts:64`). C'est une double proxification inutile ; `const store = tableStore` suffit et la réactivité est identique.

Deuxième détail : `tableStore` est un singleton de module qui n'est jamais réinitialisé. En passant d'une campagne à l'autre, l'écran affiche brièvement les personnages et le journal de la précédente, jusqu'à l'arrivée du snapshot. Un `resetTableStore()` dans `connectWs` règle ça.

---

## 3. Sécurité

Le socle s'est nettement renforcé : tout payload WS est désormais validé par un schéma partagé, toutes les routes REST passent par `requireMemberOf`, la feuille est bornée par Zod, la route de seed a disparu. Ce qui reste :

### S1 — Toujours aucune limitation de débit (priorité haute)

C'est l'item 10.2, ouvert depuis le 30/08, et c'est aujourd'hui le trou le plus large. Un membre authentifié — donc quelqu'un que vous avez invité, ce qui borne le risque réel — peut :

- boucler sur `chat.say` → un `INSERT` D1 par message, sans plafond ni rétention sur `journal` ;
- boucler sur `token.move` → un `ctx.storage.put` du `liveState` complet + un broadcast par message ;
- ouvrir autant de sockets qu'il veut sur la même campagne (aucun plafond par utilisateur dans le DO).

Le DO est le point de contrôle unique et il a maintenant un dispatch propre : un compteur à fenêtre glissante juste après le `safeParse`, plus un plafond de sockets par `userId` dans `fetch()`, tiennent en une trentaine de lignes. Et vous avez désormais l'infra de test pour les vérifier.

### S2 — Pas de borne sur la taille brute d'un message WS

`game-table.ts:288` fait `JSON.parse(raw)` avant tout. `chatSaySchema` borne `text` à 2000 caractères **après** le parse. Un message de 50 Mo est décodé puis parsé en mémoire dans le DO. `if (raw.length > 32_000) return;` en tête de `handleWsMessage`, une ligne.

### S3 — Aucun en-tête de sécurité

Toujours pas de `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`. Deux points concrets :

- `GET /api/maps/:mapId/image` renvoie le `Content-Type` **déclaré à l'upload**, pas celui déduit du sniff. Les deux sont validés séparément, donc on peut stocker un WebP annoncé `image/png` : sans gravité, mais autant servir le type sniffé et ajouter `X-Content-Type-Options: nosniff`, puisque l'image est servie depuis la même origine que l'application.
- Une CSP même permissive (`default-src 'self'; img-src 'self' data:; connect-src 'self' wss:`) est un filet utile compte tenu du point suivant.

Un middleware Hono global de 10 lignes couvre tout.

### S4 — `{@html}` avec un assainisseur maison

`compendium/+page.svelte:310-356` injecte le retour de `inlineHtml()`. J'ai relu `markdown-lite.ts` (qui a grossi de 154 à 222 lignes, l'ajout portant sur les en-têtes de tableau à deux niveaux, pas sur l'échappement) : **je n'y trouve pas d'échappatoire**. L'échappement précède la réintroduction des balises, les groupes capturés sont déjà échappés, `<sup>`/`<sub>` sont bornés à 24 caractères. C'est correct, et les 11 tests le vérifient.

Le point reste le même qu'avant : c'est un assainisseur maison de 15 lignes, et sa source est fiable **tant que l'éditeur homebrew MJ n'existe pas**. Votre note « DOMPurify obligatoire avant la phase 8 v2 » est le bon réflexe, il faut la tenir avant d'ouvrir l'édition, pas après.

### S5 — Cycle de vie des données

- Toujours aucune route de suppression de campagne. Les `ON DELETE CASCADE` sont bien posés mais personne ne peut les déclencher, et les objets R2 des cartes ne seraient de toute façon pas purgés (pas d'itération sur le préfixe `campaignId/`). C'est l'item A9. La brique `cleanupMap` que vous venez d'écrire en est la moitié.
- Pas de révocation d'invitation (`DELETE /invitations/:token`). Un lien « illimité / 30 jours » distribué sur Discord ne peut pas être coupé.
- Le cookie `hd-invite` (`index.ts:88`) est `HttpOnly; SameSite=Lax` mais pas `Secure`. Impact nul en prod HTTPS, autant l'ajouter.

### S6 — Concurrence sur l'autosave

`CharacterSheet.svelte` → `flush()` n'a toujours aucun garde-fou : deux `PUT` peuvent se croiser, et deux onglets (ou le MJ et le joueur en même temps) s'écrasent silencieusement en dernier-écrivain-gagne. Un `If-Match` sur `updatedAt` avec 409 en cas de divergence coûte peu et évite une perte de données un soir de partie.

---

## 4. Performance

### P1 — Index D1 manquants (priorité haute, gain immédiat)

Les migrations sont **identiques** à celles de la version précédente : rien n'a bougé. Il manque toujours les index qui portent les requêtes les plus fréquentes du projet.

| Table         | Colonne(s)          | Requête concernée                                                                                           |
| ------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `characters`  | `campaign_id`       | `buildSnapshot`, `handleModeSet`, liste des persos — **à chaque connexion et à chaque passage en combat**   |
| `members`     | `user_id`           | « lister mes campagnes » (la PK `(campaign_id, user_id)` ne sert pas ici)                                   |
| `maps`        | `campaign_id`       | liste des cartes                                                                                            |
| `journal`     | `(campaign_id, id)` | l'index actuel est sur `campaign_id` seul, la requête est `WHERE campaign_id = ? ORDER BY id DESC LIMIT 50` |
| `invitations` | `campaign_id`       | mineur                                                                                                      |

Le plus critique reste `characters.campaign_id` : chaque ouverture de table scanne toute la table des personnages, toutes campagnes confondues. Une migration, cinq lignes, aucun risque.

### P2 — `token.move` émis à chaque `pointermove` (priorité haute)

`table/+page.svelte:355` — inchangé.

```ts
function onMapPointerMove(e: PointerEvent) {
  ...
  sendWs({ type: 'token.move', tokenId: drag.id, x, y });
}
```

Un déplacement de pion d'une seconde = 60 à 120 messages, et **chacun** déclenche côté DO un `ctx.storage.put("liveState")` complet plus un broadcast à tous les sockets. Vous payez des écritures Durable Object pour de l'interpolation que le `dragOverride` local rend déjà fluide.

Deux correctifs, à faire ensemble :

1. Côté client, n'émettre qu'une fois par `requestAnimationFrame` — vous avez déjà le bon modèle juste au-dessus avec `FOG_SEND_MIN_DIST` pour le brouillard, il suffit de l'appliquer aux pions.
2. Côté DO, découpler la diffusion (immédiate) de la persistance (debouncée ~500 ms, plus un flush sur `webSocketClose`). Un pion mal persisté après un crash est sans gravité ; 100 écritures/seconde ne le sont pas.

### P3 — Le journal, maintenant qu'il a vocation à grossir (priorité relevée)

Vous m'avez confirmé que le journal doit pouvoir grossir énormément. Ça le fait passer de « point à surveiller » à **chantier structurant**, parce que son chemin d'écriture a un coût strictement proportionnel au volume.

**Le chemin d'écriture.** `appendJournal()` fait un `INSERT` D1 avec `.returning()`, et il est `await`é **avant** le broadcast. Chaque ligne de chat, chaque jet de dé, chaque « le MJ pose un gobelin » paie donc un aller-retour réseau dans le chemin critique du temps réel, et une ligne facturée. C'est le seul endroit du projet dont le coût croît linéairement avec l'usage.

Deux stratégies, par ordre de préférence :

1. **Journal dans le SQLite du Durable Object.** Le DO est déclaré en `new_sqlite_classes`, donc `ctx.storage.sql` est disponible : stockage local, latence quasi nulle, pas de facturation par ligne D1. Et le découpage est déjà le bon — le journal est _toujours_ filtré par `campaign_id`, qui est exactement la clé de sharding du DO. `getJournalTail()` et la pagination deviennent des lectures locales, la route REST une RPC. D1 ne garde alors qu'une copie d'archive flushée par lot, ou plus rien du tout selon ce que vous voulez pouvoir requêter hors table. Bonus non négligeable : le filtre de visibilité de B5 devient local et gratuit.
2. **Rester en D1, mais sortir l'écriture du chemin critique.** Générer un id monotone dans le DO (compteur persisté dans `ctx.storage`) au lieu de le lire de l'autoincrement D1 permet de diffuser immédiatement et de faire l'`INSERT` dans un `ctx.waitUntil`. Ça supprime la latence, pas le coût. C'est le repli si vous ne voulez pas déplacer le stockage.

**Ce qui devient obligatoire dans les deux cas :**

- L'index composite `(campaign_id, id)` passe de confort à nécessité : la requête de pagination est `WHERE campaign_id = ? AND id < ? ORDER BY id DESC LIMIT n`, et l'index actuel sur `campaign_id` seul force un tri sur un jeu qui ne fait que grandir.
- **Une politique de rétention, à décider maintenant.** D1 plafonne à 10 Go par base, et de toute façon une table qui ne fait que croître finit par coûter en lectures. L'archivage naturel ici est R2, que vous avez déjà branché : un dump NDJSON par mois ou par séance, et on ne garde en base que la fenêtre chaude. Décider tard, c'est migrer des millions de lignes.
- **Côté client, deux fuites qui ne se voient qu'au volume.** `ws.svelte.ts:207` fait l'anti-doublon avec `tableStore.journal.some(...)` : un parcours O(n) **à chaque message reçu**, avec n qui grandit toute la séance — à remplacer par un `Set` d'ids. Et ni `tableStore.journal` ni `olderEntries` (pagination) n'ont de plafond : sur une longue séance, l'onglet accumule tout. Une fenêtre glissante s'impose.
- Avec un gros historique, deux besoins produit apparaissent mécaniquement : **la recherche dans le journal** — c'est là que FTS5 a un vrai sens, bien plus que sur le compendium — et **l'export** de fin de campagne.

### P4 — Autres points, par ordre décroissant

- **`createAuth()` reconstruit `betterAuth` + `drizzleAdapter` + `createDb` à chaque requête** (`auth.ts:7`), y compris pour un `GET /api/campaigns`. L'origine étant dérivée de la requête, un cache `Map<origin, Auth>` au niveau module fait disparaître le coût.
- **Recherche compendium en `LIKE '%…%'`** (`compendium.ts:98`), non indexable, sur 1 579 fiches, avec `%` et `_` de l'utilisateur non échappés (une recherche `%` scanne tout). Zod borne maintenant `q` à 100 caractères, ce qui est déjà mieux. FTS5 sur `search_text` est la réponse ; en attendant, échapper les jokers coûte une ligne.
- **Pas de keepalive WS** : ni `setWebSocketAutoResponse` côté DO, ni ping applicatif côté client. Un proxy ou un réseau mobile qui coupe une connexion inactive n'est détecté qu'au prochain envoi. Le backoff que vous venez d'ajouter gère la reconnexion, pas la détection.
- **La reconnexion ne s'arrête jamais** : plafonnée à 8 s, elle tourne indéfiniment si la session a expiré. Un plafond de tentatives, ou une sonde `/api/health` + `getSession` après N échecs, éviterait de marteler le worker en tâche de fond dans un onglet oublié.
- `tableStore.journal` grandit sans limite en mémoire pendant une séance (plus `olderEntries` en pagination). Un plafond glissant serait prudent pour les longues sessions.

---

## 5. Tests

**~263 tests, et surtout la bonne nouvelle : le DO est enfin couvert.** Les 12 tests d'intégration de `api/test/game-table.test.ts` tournent dans workerd avec D1 réel et des WebSockets réelles, et ils testent ce qu'il fallait tester : le masquage des PV de PNJ, le filtrage des pions sous brouillard, qu'un joueur ne bouge que son pion et ne touche pas aux PV d'autrui, la séquence de combat complète, les RPC. C'était le point le plus faible de la version précédente, il ne l'est plus.

Ce qui reste découvert :

1. **Les routes REST** — zéro test. La surface d'autorisation y est maintenant concentrée dans un seul endroit (`requireMemberOf`), donc un fichier de tests sur ce middleware couvrirait beaucoup pour peu : un non-membre reçoit 403 sur chaque famille de routes, un joueur reçoit 403 sur les routes `requireMj`, le résolveur renvoie 400 sur une ressource inexistante.
2. **`consumeInvitation`** — toujours pas de test. Le code est écrit pour être atomique (décrément conditionnel, rollback sur contrainte d'unicité), personne ne l'a jamais vérifié. Deux appels concurrents sur un lien à 1 usage : c'est exactement le genre de chose que `vitest-pool-workers` sait faire maintenant que l'infra est là.
3. **La visibilité du compendium** — qu'une fiche `visibility:"mj"` non partagée renvoie bien 404 à un joueur. Un test, et B4 ci-dessus serait probablement apparu tout seul.
4. **oxlint ne voit toujours aucun `.svelte`** (99 fichiers analysés). Les deux plus gros fichiers du projet ne sont jamais lintés. `svelte-check` couvre les types (41 warnings d'après votre audit), pas les règles ni l'accessibilité.
5. La session réelle à deux navigateurs — que votre handoff signale comme jamais faite. C'est toujours le test le plus rentable de la liste.

---

## 6. Plan d'action proposé

Priorisation revue le 6 septembre après vos arbitrages (§7) : le masquage des noms de PNJ devient un correctif, et le journal remonte d'un cran.

**Immédiat (une demi-journée, sans risque)**

1. B1 — RPC d'invalidation du cache de settings du DO
2. B2 — `createSheet(body.sheet)` au lieu du mapping champ par champ (règle aussi `caAuto`, `portrait`, `inspiration`)
3. P1 — la migration d'index D1, avec `journal (campaign_id, id)` en composite
4. P2 — le throttle `requestAnimationFrame` sur `token.move`
5. B6 — `zValidator` sur `POST /campaigns`, suppression de `validation.ts` mort, filtre `active` dans `handleModeSet`
6. P3 (partiel, 20 minutes) — `Set` d'ids pour l'anti-doublon du journal côté client, fenêtre glissante en mémoire

**Le chantier journal + brouillard (à faire d'un bloc, ~3 jours)**

C'est le seul endroit du plan où deux items doivent être menés ensemble : B5 impose une colonne `visibility` sur `journal`, P3 impose de décider où cette table vit. Écrire deux migrations successives sur la même table, à quinze jours d'intervalle, serait du travail perdu.

7. Décider le stockage du journal (SQLite du DO, ou D1 avec id monotone + `waitUntil`) et la politique de rétention/archivage R2
8. B5 — `visiblePnjIds()`, cartes de PNJ omises et poussées au changement de visibilité, `combat` en `broadcastRoleAware`, `visibility` sur les entrées de journal filtrée des deux côtés
9. Les tests d'intégration DO qui vont avec : un joueur ne voit ni le pion, ni la carte, ni la ligne de journal d'un PNJ non révélé — avant **et** après rechargement

**Court terme (le reste, avant la prochaine brique fonctionnelle)**

10. S1 — limitation de débit WS + plafond de sockets par utilisateur, avec ses tests
11. S2 — borne sur la taille brute des messages WS ; N3 — contrôle de `Content-Length` sur les routes JSON
12. B4 — composer `visibilityWhere` dans `/entry` (+ le test de visibilité)
13. B3 — `applyDamage` dans `shared/`, testé, appelé des deux côtés
14. Tests REST sur `requireMemberOf` et `consumeInvitation`
15. La session à deux navigateurs

**Ensuite**

16. N1 — bornes de la feuille dérivées du schéma (avant que la 9c ne fasse bouger des valeurs)
17. N2 — résolveurs qui posent la ligne dans le contexte ; `discordId` paresseux ; cache de `createAuth`
18. S3 — middleware d'en-têtes de sécurité ; type sniffé servi sur les images
19. S5 — suppression de campagne avec purge R2, révocation d'invitation
20. S6 — `If-Match` sur l'autosave de la feuille
21. P4 — keepalive WS, plafond de reconnexion
22. Recherche dans le journal (FTS5) et export de fin de campagne, quand le volume le justifiera

---

## 7. Arbitrages retenus (6 septembre)

Les trois questions ouvertes de la version précédente sont tranchées. Voici ce que chacune change dans le rapport.

**Le journal a vocation à grossir énormément.** P3 cesse d'être un « à surveiller » et devient un chantier à part entière (§4). Concrètement : le chemin d'écriture doit sortir du `await` avant broadcast, l'index composite `(campaign_id, id)` devient nécessaire et pas optionnel, une politique de rétention/archivage R2 doit être décidée maintenant plutôt qu'une fois la table pleine, et les deux fuites mémoire côté client (l'anti-doublon en O(n), le journal sans plafond) passent de coquetterie à correctif.

**Le brouillard doit aussi masquer les noms de PNJ.** Ce n'est donc plus une question produit mais le bug B5 (§1), et c'est le plus lourd des points ouverts. Le point important est qu'il ne se règle pas dans `filterCharactersForPlayers` : les noms fuient par quatre canaux distincts, dont le journal persistant, qui rend l'historique complet à quiconque recharge la page. Il faut traiter les quatre, sinon le correctif donne une fausse impression de sécurité — ce qui est pire que l'état actuel, où au moins vous savez que les PNJ sont visibles.

**Le produit reste une poignée de tables privées.** Cette réponse ne dispense pas de P3 : votre croissance est _verticale_ (peu de campagnes, mais des journaux profonds et durables), pas horizontale. En revanche elle maintient au plancher tout ce qui relève du passage à l'échelle en nombre d'utilisateurs — FTS5 sur le compendium (1 579 fiches, `LIKE` suffit), le cache de `createAuth`, la requête `account` de `requireAuth`. Ces points restent justes, ils ne sont simplement jamais urgents. Elle a aussi un corollaire agréable sur B5 : à cinq joueurs, vous pouvez vous permettre de recalculer et renvoyer la vue visible complète à chaque changement de brouillard, plutôt que de calculer des deltas de visibilité — nettement plus simple à écrire et à tester, pour un coût réseau négligeable à cette taille.

Reste une décision que je vous laisse, et qui conditionne le point 7 du plan : **le journal vit-il en D1 ou dans le SQLite du Durable Object ?** Le second est plus rapide, moins cher et simplifie le filtrage de B5, mais il déplace la donnée hors de la base que vous savez déjà interroger et sauvegarder. Si l'export et l'inspection hors ligne comptent pour vous, la solution 2 (D1, id monotone, `waitUntil`) est le compromis raisonnable.
