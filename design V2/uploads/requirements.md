# RollWith H&D — Requirements

> **Document 1/3 — Requirements** (spec-driven development).
> Sources : `Récapitulatif - Écran de jeu & Design System.md` (référence produit), prototypes
> `Ecran de jeu.dc.html`, `Feuille de personnage.dc.html`, `Compendium.dc.html`, `Design System.dc.html`.
> Ce document décrit le **QUOI** : comportements attendus, règles métier, critères d'acceptation.
> Le **COMMENT** (stack, schéma, protocoles) est dans `design.md`. Le découpage est dans `tasks.md`.

---

## Introduction

RollWith H&D est une table virtuelle (VTT) privée pour jouer à **Héros & Dragons** (SRD 5E français)
entre amis, en ligne. Elle combine trois modules autour d'un même modèle de données :

1. **L'écran de jeu** : carte partagée avec pions, dés, journal, gestion de combat, inventaires, outils MJ.
2. **La feuille de personnage** : vue détaillée et éditable du même modèle personnage, avec jets intégrés.
3. **Le compendium** : tout le contenu du DRS H&D ingéré, normalisé et consultable sans quitter la table,
   avec visibilité MJ/joueurs et contenu homebrew.

**Contexte d'usage (structurant)** : usage privé entre amis (1 MJ + 3–6 joueurs, une ou deux campagnes
actives). Pas de facturation, pas de SEO, pas d'onboarding public. Desktop uniquement, mode clair
uniquement, textes UI en français. Une éventuelle version SaaS est hors périmètre.

**Glossaire** : MJ = maître du jeu · PJ = personnage joueur · PNJ = personnage non joueur ·
DRS = Document de Référence Système H&D (repo `igwane/heros-et-dragons-drs`) ·
Table = session de jeu temps réel d'une campagne.

---

## R1 — Comptes, campagnes et rôles

**User story** : en tant qu'ami invité, je me connecte avec Discord et je rejoins la campagne de mon MJ
avec un rôle fixe.

Critères d'acceptation :

1. Authentification exclusivement via **Discord OAuth**. Aucune inscription libre : seuls les comptes
   Discord **autorisés** (whitelist ou lien d'invitation à usage limité) peuvent créer une session.
2. Un utilisateur peut créer une **campagne** (il en devient MJ) ou rejoindre une campagne via
   **invitation** (il devient joueur).
3. Le rôle (MJ / joueur) est **fixe par campagne** — le sélecteur « vu comme » du prototype n'existe pas
   dans le produit. Un même compte peut être MJ d'une campagne et joueur d'une autre.
4. Un joueur est associé à **son** personnage (1 PJ actif par joueur par campagne ; plusieurs PJ possibles
   mais un seul actif à la fois).
5. Page d'accueil connectée : liste de mes campagnes, bouton rejoindre/créer, entrée vers la table,
   ma feuille, le compendium.

## R2 — Modèle personnage unique

**User story** : en tant que joueur, mes PV, mon inventaire et mes stats sont identiques partout
(carte compagnie, feuille, journal).

Critères d'acceptation :

1. Il existe **une seule source de vérité** par personnage ; l'écran de jeu et la feuille en sont deux vues.
2. On ne stocke que les **données sources** ; les valeurs dérivées sont calculées, jamais saisies :
   - modificateur = ⌊(valeur − 10) / 2⌋ ;
   - bonus de maîtrise selon niveau (5E : +2 aux niv. 1–4, +3 aux 5–8, +4 aux 9–12, +5 aux 13–16, +6 aux 17–20) ;
   - sauvegarde / compétence = mod + maîtrise si maîtrisée ;
   - perception passive = 10 + mod Perception ;
   - DD de sauvegarde des sorts = 8 + maîtrise + mod carac d'incantation ; attaque de sort = maîtrise + mod ;
   - seuils d'XP 5E.
3. Le personnage porte : identité (nom, race, classe, niveau, historique, alignement, XP, citation),
   6 caracs brutes, maîtrises (6 sauvegardes + 18 compétences H&D), CA, vitesse, initiative (mod DEX
   - bonus éventuel), PV (courants / max / temporaires), dés de vie, jets contre la mort, inspiration,
     attaques, sorts (connus, emplacements par niveau, carac d'incantation), capacités & traits,
     personnalité, langues & maîtrises, équipement (bourse po/pa/pc + objets ×quantité), couleur de pion.
4. Les PNJ utilisent un modèle réduit (nom, PV/max, CA, init, états) compatible avec la compagnie et la carte.

## R3 — Écran de jeu : structure et modes

Critères d'acceptation :

1. Layout plein écran 100vh sans scroll global : barre de session en haut, colonne Compagnie (~262px)
   à gauche, carte au centre (flex:1) surmontée d'un bandeau contextuel (+ barre outils MJ si MJ),
   panneau à onglets (~324px) à droite.
2. Barre de session : titre de campagne + annotation manuscrite ; bascule **🥾 Exploration / ⚔ Combat** ;
   **dés rapides** d4→d20 (d20 en rouge accent) ; lien « ✦ compendium ↗ » ; indicateur des membres connectés.
3. Passer en Combat démarre la phase d'initiative (R8) ; revenir en Exploration termine le combat.
4. Toute l'UI respecte le design system « Carnet crayonné » (R12).

## R4 — Compagnie (PJ & PNJ)

Critères d'acceptation :

1. Cartes PJ : nom, CA, sous-titre race/classe/niveau, barre de PV hachurée avec boutons −/+ (selon
   permissions), PV x/max, bonus d'initiative, chips d'états, lien « feuille ↗ ». Bordures sketchy et
   rotations légères **variées d'une carte à l'autre**.
2. Cartes PNJ compactes : PV, ✕ suppression (MJ), PV masquables aux joueurs via le réglage de table
   `pnjPvVisible`.
3. Permissions PV : MJ modifie tous les PV ; un joueur seulement les siens.
4. États (À terre, Empoisonné, …, issus du compendium catégorie `etats`) : ajout/retrait par le MJ
   uniquement ; chip cliquable pour retrait ; tooltip de l'état au survol (R11.6).
5. Un personnage passant à 0 PV déclenche un message journal « X tombe à 0 PV ! ».
6. En combat, la carte du personnage actif est mise en évidence (bordure rouge + annotation
   « à lui de jouer ! »).

## R5 — Carte, pions, repères, pings, brouillard

Critères d'acceptation :

1. **Cartes** : le MJ gère une liste de cartes par campagne (nom + image importée ou quadrillage par
   défaut 32px) et sélectionne la carte active, synchronisée pour tous. L'import d'image est stocké
   côté serveur (pas de dataURL) et servi aux clients.
2. **Pions** : un pion référence un personnage. PJ = fond papier, bordure/initiale couleur du perso ;
   PNJ = fond carmin. Étiquette nom en Caveat. Positions en % (clamp 2–98). Drag & drop fluide.
   Permissions : MJ déplace tout ; joueur uniquement son pion. Chaque déplacement est journalisé.
   Le pion du personnage actif en combat porte un double anneau rouge.
3. **Repères** : drapeaux ⚑ à texte manuscrit, posés/déplacés/supprimés par le MJ seul (outil ✎ +
   champ texte, ✕ par repère, « effacer les repères »).
4. **Pings** : double-clic n'importe où → anneau rouge animé ~1,8s visible par **tous** en temps réel.
5. **Brouillard de guerre**, par carte : le MJ l'active (tout couvert), **dévoile en glissant** sur la
   carte, peut « tout recouvrir » ou « dissiper ». Les révélations sont des zones circulaires à bords
   doux. Rendu : MJ semi-transparent (~0,45), joueurs opaque — **mêmes données, rendus différents**.
   Les zones non révélées ne doivent pas laisser deviner le contenu aux joueurs.
6. **Outils MJ** (barre visible en vue MJ) : sélecteur de cartes, import de carte, outils exclusifs
   ✥ déplacer / + PNJ / ✎ repère / ▒ brouillard, avec hints manuscrits contextuels.
7. Ajout de PNJ : à la volée (nom, PV, CA, init) ou depuis une fiche monstre du compendium (R11.5).

## R6 — Dés

Critères d'acceptation :

1. Tous les jets sont **générés et validés côté serveur** (anti-triche), y compris depuis la feuille.
   Le client ne fait qu'animer un résultat déjà connu.
2. Dés rapides d4→d20 : 1 dé + modificateur global saisi dans l'onglet Dés (défaut +0).
3. Commande chat `/XdY±Z` (X ≤ 20, 2 ≤ Y ≤ 100) : jet composé journalisé.
4. Sur 1d20 : détection **critique** (20 naturel) et **échec critique** (1 naturel) avec flair dédié.
5. Chaque jet produit une **carte de jet** au journal : qui, expression (`1d20+7`), total en gros Caveat
   rouge, détail `= 12 + 7`. Le lanceur voit en plus le **dé animé** en overlay (type de dé silhouetté,
   faces qui défilent, durée réglable), les autres voient la carte de jet arriver.
6. Décision produit reconduite : **pas de mode avantage/désavantage** dans l'onglet Dés.
7. Onglet Dés : modificateur, grille des 6 dés, historique des 6 derniers jets.

## R7 — Journal & chat

Critères d'acceptation :

1. Flux horodaté (hh:mm) persistant par campagne : paroles (« — texte »), actions système en italique
   grisé préfixées ✦ (déplacements, PV, états, échanges, éditions de feuille), cartes de jets,
   fiches partagées (R11.7).
2. Champ de saisie + ➤, Enter envoie, `/XdY±Z` lance un jet.
3. Auto-scroll en bas à chaque entrée ; l'historique complet reste consultable (scroll infini ou
   pagination simple).
4. Le journal est synchronisé en temps réel pour tous les membres connectés et rechargeable à la
   reconnexion.

## R8 — Combat & initiative

Critères d'acceptation :

1. Participants : personnages ayant un pion sur la carte active ET pv > 0 au passage en Combat.
2. Phase `init` : le serveur lance **automatiquement et silencieusement** l'initiative des PNJ (d20 + init).
3. **Les joueurs lancent eux-mêmes leur initiative** (jamais de calcul auto pour les PJ) : bandeau avec
   un bouton « ✦ Nom lance son initiative ! » actif pour ce joueur **et** pour le MJ (secours si absent),
   grisé dashed pour les autres. Le jet est serveur, animé, journalisé.
4. Les scores connus s'affichent en chips au fur et à mesure. Quand tous ont lancé → phase `run`,
   ordre décroissant, message « Initiative complète : … C'est à X ! ».
5. Phase `run` : chip active en rouge, carte compagnie et pion mis en évidence ; **Tour suivant →**
   (MJ) avance le tour, le retour en début d'ordre incrémente le round.
6. 🥾 Exploration met fin au combat.
7. Égalités d'initiative : départage stable (bonus d'init le plus haut, puis PJ avant PNJ, puis ordre
   de jet).

## R9 — Inventaire & échanges

Critères d'acceptation :

1. Onglet Inventaire : sélecteur de sac — un joueur est **verrouillé sur le sien**, le MJ consulte et
   édite tous.
2. **Bourse** po/pa/pc. **Échange d'argent** : donner un montant à un autre PJ avec vérification de
   solde (pas de conversion automatique entre monnaies).
3. Objets ×quantité : donner ×1 à un destinataire (→), jeter ×1 (✕), ajouter (fusion par nom insensible
   à la casse et incrément de quantité).
4. Tous les mouvements (dons d'argent, d'objets, ajouts, jets d'objets) sont **journalisés**.
5. Les transferts sont atomiques : pas de duplication ni de perte en cas d'actions simultanées.

## R10 — Feuille de personnage

**User story** : en tant que joueur, je consulte et modifie ma feuille, et tous mes jets partent au
journal de la table.

Critères d'acceptation :

1. Page dédiée par personnage, accessible depuis la carte compagnie (« feuille ↗ ») avec retour
   « ← retour à la table ». Layout 4 colonnes conforme au prototype :
   caractéristiques · sauvegardes/compétences · combat · traits/équipement.
2. **Tout est jetable** : clic sur une carac = test (d20 + mod) ; ligne de sauvegarde ou de compétence
   = jet ; initiative = jet ; ligne d'attaque = jet d'attaque ; les jets partent au journal (R6.1, R6.5)
   et affichent un toast local (faces qui défilent puis résultat, critiques signalés).
3. Interactions directes (hors mode édition) : PV −/+, PV temporaires, inspiration (toggle), jets contre
   la mort (2×3 pips), emplacements de sorts (cocher/libérer), dés de vie restants.
4. Le bloc sorts est masqué pour les non-lanceurs.
5. **Édition en place** (propriétaire + MJ) : un mode « ✎ éditer » global ou par bloc transforme les
   valeurs en inputs sketchy ; listes (attaques, traits, objets, sorts) avec ajout « + hop » dashed,
   suppression ✕, réordonnancement par drag. Pas de page de formulaire séparée.
6. **On n'édite que les sources, jamais les dérivés** (R2.2). Éditables : caracs brutes, identité,
   niveau/classe/race/historique/alignement/XP, cases de maîtrise, CA, vitesse, PV max, attaques,
   sorts connus + emplacements max, capacités & traits, personnalité, langues & maîtrises, équipement.
7. Deux niveaux d'assistance : saisie **libre** (tout champ modifiable à la main — indispensable pour
   l'homebrew) ET saisie **assistée par le compendium** (choisir une arme/un sort/une classe pré-remplit
   les champs). **Le libre prime toujours** : une valeur saisie à la main n'est jamais écrasée.
8. **Création de personnage** : assistant pas-à-pas (race → classe → caracs → historique → équipement)
   alimenté par le compendium, qui produit le même modèle de données. Chaque étape reste modifiable
   librement.
9. **Montée de niveau** : action dédiée (pas une simple édition du niveau) qui propose les gains du
   niveau (PV, capacités de classe, sorts, bonus de maîtrise) tout en laissant tout ajuster.
10. Toute modification en cours de partie est **journalisée** (« Kaelith modifie sa feuille : CA 17 → 18 »).
    Le MJ peut **verrouiller** l'édition des feuilles (réglage de campagne, ex. hors préparation).

## R11 — Compendium

**User story** : en tant que MJ ou joueur, je consulte tout le contenu H&D sans quitter le site, et le
MJ s'en sert pour peupler la table.

Critères d'acceptation :

1. **Pipeline d'ingestion ré-exécutable** depuis le repo DRS (`docs/<catégorie>/<slug>/README.md`) :
   parse du frontmatter (tableaux markdown, y compris imbriqués) et du corps en sections ; normalisation
   vers le **schéma canonique** ; résolution des liens internes en liens de compendium ; construction de
   l'index de recherche ; publication versionnée (hash par fiche) — une ré-ingestion produit un diff et
   n'écrase jamais silencieusement (le homebrew n'est jamais touché).
2. Schéma canonique : `slug, category, title, source, meta (typé par catégorie), body (sections),
visibility, version, hash`. Catégories : bestiaire, grimoire, races, classes, historiques, dons,
   équipement, objets-magiques, états, règles. Les `meta` alimentent les usages programmatiques,
   le `body` l'affichage — même donnée pour la fiche, le tooltip et le pré-remplissage.
3. **Visibilité** portée par la donnée et appliquée **côté serveur** : public (règles, races, classes,
   historiques, dons, grimoire, équipement, états) vs **MJ uniquement** (bestiaire, objets magiques).
   L'API ne sert jamais une fiche MJ à un client joueur ; les joueurs ne voient ni les catégories ni
   les fiches réservées.
4. **Écran compendium** trois colonnes : catégories (compteurs, ✒ = réservé MJ) · liste filtrable
   (recherche globale + méta FP/type ou niveau/école) · fiche dense. Deux gabarits riches : **monstre**
   (bandeau CA/PV/vitesse/FP, 6 caracs, sauvegardes/compétences/sens/langues, sections Capacités /
   Actions / Actions légendaires) et **sort** (incantation/portée/composantes/durée/classes,
   description) ; gabarit générique pour les autres catégories.
5. **MJ → carte** : « poser sur la carte (PNJ) » depuis une fiche monstre crée le PNJ pré-rempli
   (PV moyenne, CA, init = mod DEX).
6. **Tooltips partout** : survol d'un état sur une carte PJ, d'un nom de sort/terme lié dans le journal
   ou la feuille → mini-fiche.
7. **Partage au journal** (MJ) : la fiche devient consultable par les joueurs même si sa catégorie est
   réservée (révélation à la fiche ; option de révélation partielle nom + type, sans les stats).
8. **Homebrew** : le MJ crée/édite des fiches au même schéma (`source: "maison"`), privées MJ par
   défaut, publiables.
9. **Recherche globale** toutes catégories, filtrée par la visibilité du rôle.

## R12 — Design system « Carnet crayonné »

Critères d'acceptation :

1. Application stricte des tokens du DS : papier `#FBF8F0`, panneau `#FFFEF9`, encre `#33302A`,
   encre secondaire `#7C7669`, carmin `#C0392B` (bord `#8F281D`, hover `#A22F23`, texte sur rouge
   `#FFF7EE`), traits clairs/dashed `#C6BFAC`/`#A8A08D`/`#D9D3C4`, quadrillage `#F4F0E3`/`#E4DEC9`
   (32px), lignes de cahier `#EFEADB` (28px), barres PV hachurées `-55deg #C0392B/#D25243`.
2. Fontes : Cormorant Garamond 700 (titres), Spectral 400–600 (courant), Caveat 500–600 (annotations,
   souvent carmin + rotation ±1,5°), IBM Plex Mono (chiffres, dés, stats, timestamps).
3. Signature « main levée » : bordures 2px encre à radius sketchy 8 valeurs, **variées d'un élément à
   l'autre** (jamais deux cartes identiques côte à côte) ; rotations légères sur cartes/badges/chips,
   jamais sur le texte courant ; dashed = à compléter ; pions = cercles imparfaits.
4. Le carmin est réservé aux actions, résultats de dés et annotations — jamais en fond de grande surface.
5. Consultation (compendium) : dense, 2 colonnes possibles ; écrans de jeu : aérés.
6. Pas d'emoji hors glyphes ⚔ ✦ ⚑ ✥ ✎ ▒ ✕ ➤ 🥾 ✒. Micro-animations sobres (ping `hdPing`, dé 75ms,
   hovers = inversions de couleurs).

## R13 — Temps réel, persistance, reconnexion

Critères d'acceptation :

1. Synchronisés en temps réel entre tous les membres connectés d'une campagne : positions des pions,
   repères, pings, brouillard, carte active, PV/états, PNJ, mode et état de combat, journal/jets,
   inventaires, éditions de feuille, présence.
2. Latence perçue < 300 ms en usage normal ; les actions locales sont optimistes quand c'est sûr
   (drag de son pion) et corrigées par l'état serveur sinon.
3. À la (re)connexion, un client reçoit un **snapshot complet** de l'état de table puis les deltas.
4. L'état durable (personnages, journal, cartes, compendium, campagnes) survit aux redémarrages ;
   l'état de séance (pions, brouillard, combat, carte active) est persisté au fil de l'eau et retrouvé
   à l'identique en rouvrant la table.
5. Un utilisateur non membre de la campagne ne peut ni se connecter à sa table ni lire ses données.

## R14 — Non-fonctionnel

1. **Coût** : l'ensemble doit tenir dans les tiers gratuits/entrée de gamme Cloudflare (Workers,
   D1, R2, Durable Objects — plan payant Workers 5$/mois accepté si nécessaire pour les DO).
2. **Volumétrie cible** : ≤ 10 utilisateurs, ≤ 3 campagnes actives, ≤ 8 connexions WebSocket
   simultanées, compendium ≈ 1 500–3 000 fiches.
3. Desktop ≥ 1280px, mode clair uniquement, UI en français. Pas d'exigence d'accessibilité formelle,
   mais contrastes du DS respectés.
4. Images de cartes : ≤ 8 Mo par image, formats png/jpg/webp.
5. Sauvegarde : export possible des données de campagne (JSON) — nice-to-have, phase finale.
6. Licences : contenu DRS sous licence de son repo source (OGL/CC) ; mention de source sur les fiches.

---

## Hors périmètre (v1)

- Mobile / responsive, mode sombre, i18n.
- Multi-systèmes / templates génériques (RollWith SaaS) — cette version est H&D natif.
- Audio/vidéo, mesure de distances, murs/lumières dynamiques, grille avec snapping.
- Avantage/désavantage dans l'onglet Dés (décision produit).
- Marketplace, facturation, comptes publics.
