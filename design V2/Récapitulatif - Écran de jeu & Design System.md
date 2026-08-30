# Héros & Dragons — Récapitulatif technique

## Écran de jeu (table virtuelle) & Design System « Carnet crayonné »

Document de référence destiné à la rédaction des specs de développement.
Fichiers sources : `Ecran de jeu.dc.html` (prototype fonctionnel complet) et `Design System.dc.html` (spec visuelle).

---

# 1. L'écran de jeu

## 1.1 Vue d'ensemble

Table virtuelle (VTT) pour jouer à Héros & Dragons en ligne : carte partagée avec pions, dés, journal de partie, gestion de combat, inventaires et outils de maître du jeu (MJ). Desktop uniquement, mode clair uniquement.

**Layout** (plein écran, `100vh`, pas de scroll global) :

```
┌──────────────────────────────────────────────────────────────┐
│ Barre de session : titre campagne · mode Exploration/Combat  │
│ · dés rapides d4→d20 · sélecteur de rôle (MJ / joueur)       │
├───────────┬────────────────────────────────┬─────────────────┤
│ Compagnie │ [Bandeau combat OU exploration]│ Panneau à onglets│
│ (262px)   │ [Barre outils MJ, si MJ]       │ (324px)         │
│ PJ + PNJ  │                                │ Journal / Dés / │
│           │ CARTE (flex:1)                 │ Inventaire      │
│           │ pions, repères, brouillard,    │                 │
│           │ pings, dé animé                │                 │
└───────────┴────────────────────────────────┴─────────────────┘
```

## 1.2 Rôles et permissions

Un sélecteur « vu comme » dans la barre de session simule le point de vue : **MJ** ou l'un des 3 joueurs (Kaelith, Borin, Sylvia). Dans le vrai produit, chaque utilisateur aura un rôle fixe ; le sélecteur n'existe que pour le prototype.

| Capacité                                           | MJ                                               | Joueur                       |
| -------------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| Déplacer un pion                                   | tous                                             | seulement le sien            |
| Modifier PV (boutons −/+)                          | tous                                             | seulement les siens          |
| Ajouter/retirer un état (À terre, Empoisonné…)     | oui                                              | non                          |
| Ajouter/retirer des PNJ                            | oui                                              | non                          |
| Changer de carte, importer une image de carte      | oui                                              | non                          |
| Poser/déplacer/supprimer des repères               | oui                                              | non                          |
| Brouillard de guerre (activer, dévoiler, dissiper) | oui                                              | non (le subit)               |
| Lancer l'initiative                                | pour les PNJ + peut lancer pour un joueur absent | chacun lance la sienne       |
| « Tour suivant » en combat                         | oui                                              | non                          |
| Voir PV des PNJ                                    | oui                                              | selon réglage `pnjPvVisible` |
| Inventaire                                         | consulte/édite tous les sacs                     | seulement le sien            |
| Ping (double-clic carte), chat, jets de dés        | tous                                             | tous                         |

## 1.3 Barre de session

- Titre de campagne + annotation manuscrite (n° de séance, astuce).
- Bascule de mode **🥾 Exploration / ⚔ Combat** (deux boutons soudés). Passer en Combat démarre la phase d'initiative ; revenir en Exploration termine le combat.
- **Dés rapides** : d4, d6, d8, d10, d12, d20 (le d20 est en rouge accent). Un clic lance 1 dé + le modificateur saisi dans l'onglet Dés.
- Sélecteur de rôle (prototype uniquement).

## 1.4 Colonne gauche — Compagnie & PNJ

- Fond « lignes de cahier » (repeating-linear-gradient 28px).
- **Cartes PJ** : nom, CA, sous-titre (race/classe/niveau), barre de PV hachurée rouge avec boutons −/+ (si autorisé), PV x/max, bonus d'initiative, chips d'états (Caveat rouge, cliquables par le MJ pour retirer) + select « + état » (MJ). Bordure sketchy et rotation légère variées par carte. Pendant le combat, la carte du personnage actif a une bordure rouge et une annotation « à lui de jouer ! ».
- **Cartes PNJ** : version compacte, avec bouton ✕ de suppression (MJ) et PV masquables aux joueurs via le réglage `pnjPvVisible`.
- Un personnage à 0 PV déclenche un message journal « X tombe à 0 PV ! ».

## 1.5 Carte centrale

### Bandeaux au-dessus de la carte

- **Exploration** : nom de la carte, mention « mode exploration — déplacez-vous librement », échelle (1 case ≈ 1,50 m).
- **Combat** : suite de chips d'initiative (score · nom), triées décroissantes, chip active en rouge ; compteur de round ; bouton « Tour suivant → » (MJ). Pendant la phase d'initiative, boutons d'appel par personnage (voir 1.7).
- **Outils MJ** (visible seulement en vue MJ) : sélecteur de cartes (chips), « + importer une carte » (input file image → dataURL), outils exclusifs **✥ déplacer / + PNJ / ✎ repère** (avec champ texte du repère), « effacer les repères », puis **▒ brouillard** avec sous-actions « tout recouvrir » / « dissiper ». Des hints manuscrits guident l'action en cours.

### La carte elle-même

- Cadre sketchy 2px, coins irréguliers. Fond : image importée (object-fit cover), ou quadrillage 32px (#F4F0E3 / lignes #E4DEC9) avec taches de « terrain » pour les cartes par défaut (Forêt de Valombre, Donjon du guet).
- **Pions** : cercles légèrement irréguliers. PJ = fond papier, bordure/initiale à la couleur du personnage. PNJ = fond rouge carmin, texte crème. Étiquette nom en Caveat sous le pion. Drag & drop (pointer events, positions en % de la carte, clamp 2–98 %). Le pion du personnage actif en combat a un double anneau rouge. Chaque déplacement notifie le journal.
- **Repères** : drapeaux ⚑ texte manuscrit rouge, bordure dashed. Posés par clic (outil ✎), déplaçables par drag, supprimables via le petit ✕ (MJ seulement — le ✕ écoute `onPointerDown` avec `stopPropagation` pour ne pas déclencher le drag).
- **Pings** : double-clic n'importe où → anneau rouge animé 1,8 s (keyframes `hdPing`), visible par tous.
- **Dé animé** : overlay centré au lancement — silhouette du dé (clip-path par type : d4 triangle, d6 carré arrondi, d8 losange, d10/d12 pentagones, d20 hexagone), faces qui défilent toutes les 75 ms pendant `diceDuration` (prop, défaut 1,2 s), puis résultat + cartouche « Qui · expression » et total en Caveat rouge. Disparaît après 1,7 s.

### Brouillard de guerre

- Par carte (état `fog[mapId] = { on, reveals: [{x,y}%] }`).
- Rendu sur un `<canvas>` plein cadre au-dessus de la carte (z-index 15, sous les pings) : aplat encre foncée #3B372E + fines hachures diagonales claires, puis trous percés en `destination-out` avec dégradés radiaux (rayon 68px, cœur opaque 35 %) → bords doux.
- **MJ** : opacité 0,45 (il voit à travers) ; **joueurs** : opacité 1 (opaque). Le canvas est `pointer-events:none` ; c'est la carte qui capte les pointer events.
- Interaction MJ : bouton ▒ brouillard active le voile (tout couvert) et sélectionne l'outil ; ensuite **glisser sur la carte pour dévoiler** (pointerdown + move → ajout de reveals). « tout recouvrir » réinitialise les reveals ; « dissiper » désactive le voile.
- Redessiné à chaque update et au resize de la fenêtre.

## 1.6 Dés

- Moteur : `roll(sides, {n, mod, who})`. Modificateur global saisi dans l'onglet Dés (`+0` par défaut). Critique/échec critique détectés sur 1d20 (flair « critique ! » / « échec critique… », total grisé sur échec).
- Chaque jet produit une **carte de jet** dans le journal : titre, expression (`1d20+3`), total en gros Caveat rouge, détail `= 14 + 3`.
- Chat : la commande `/2d6+3` (regex `\d*d\d+±\d`) lance un jet composé (max 20 dés, 2 ≤ faces ≤ 100).
- Onglet Dés : modificateur, grille des 6 dés en grand, historique des 6 derniers jets.
- ⚠ Décision produit : **pas de mode normal/avantage/désavantage** dans l'onglet Dés (retiré volontairement — inutile).

## 1.7 Combat & initiative

Flux voulu (décision produit : **les joueurs lancent eux-mêmes leur initiative**, jamais de calcul automatique pour les PJ) :

1. MJ clique **⚔ Combat** → `combat = { phase:'init', ids, scores, order:null, turn:0, round:1 }`. Seuls les personnages ayant un pion sur la carte ET pv > 0 participent.
2. Le système lance automatiquement l'initiative **des PNJ uniquement** (d20 + init, en silence).
3. Bandeau combat : pour chaque PJ n'ayant pas lancé, un bouton « ✦ Nom lance son initiative ! » — actif pour ce joueur (et pour le MJ, en secours si un joueur est absent), grisé dashed « Nom n'a pas encore lancé… » pour les autres. Le clic déclenche le dé animé (d20 + bonus init du perso), le jet apparaît au journal.
4. Les scores connus s'affichent en chips au fur et à mesure. Quand tous ont lancé → `phase:'run'`, ordre trié décroissant, message journal « Initiative complète : … C'est à X ! ».
5. `phase:'run'` : chip active en rouge, carte et pion du personnage actif mis en évidence. Bouton **Tour suivant →** (MJ) avance le tour ; retour en début d'ordre incrémente le round.
6. **🥾 Exploration** met fin au combat (`combat=null`).

## 1.8 Panneau droit (onglets Journal / Dés / Inventaire)

- **Journal** : flux horodaté (hh:mm) — paroles des joueurs (« — texte »), actions système en italique grisé préfixées ✦, cartes de jets. Auto-scroll en bas à chaque entrée. Champ de saisie + bouton ➤ ; Enter envoie ; `/XdY+Z` lance des dés.
- **Dés** : voir 1.6.
- **Inventaire** : sélecteur de sac (verrouillé sur soi pour un joueur) ; **bourse** po/pa/pc ; bloc **échange** (donner un montant po/pa/pc à un autre PJ, avec vérification de solde) ; liste d'objets ×quantité avec boutons **→** (donner ×1 au destinataire choisi) et **✕** (jeter ×1) ; ajout d'objet (fusion par nom insensible à la casse). Tous les échanges sont journalisés.

## 1.9 Modèle de données (état du prototype)

```js
{
  role: 'mj'|charId,           // point de vue (prototype)
  mode: 'exploration'|'combat',
  tab: 'journal'|'dice'|'inv',
  tool: 'move'|'pnj'|'marker'|'fog',   // outil MJ actif sur la carte
  maps: [{ id, name, img? }],  mapSel: id,
  chars: [{ id, name, kind:'pj'|'pnj', sub?, pv, pvMax, ca, init, color?, conds?,
            money?:{po,pa,pc}, items?:[{n,q}] }],
  tokens: [{ id, charId, x, y }],      // % de la carte
  markers: [{ id, x, y, text }],
  fog: { [mapId]: { on, reveals:[{x,y}] } },
  pings: [{ id, x, y }],               // éphémères (1,9 s)
  combat: null | { phase:'init'|'run', ids, scores:{id:total}, order, turn, round },
  dice: null | { sides, face, rot, rolling, label, big },
  journal: [{ time, who, whoColor, text, hasRoll?, rollTitle?, expr?, total?, detail?, totalColor? }]
}
```

## 1.10 Props tweakables (composant)

- `pnjPvVisible` (boolean, défaut true) — les joueurs voient-ils les PV des PNJ.
- `diceDuration` (0,4–2,5 s, défaut 1,2) — durée de l'animation de dé.
- `tokenSize` (32–64 px, défaut 44) — diamètre des pions.

## 1.11 Feuille de personnage (`Feuille de personnage.dc.html`)

Page à part entière (un prototype : la feuille de Kaelith), accessible depuis l'écran de jeu via un lien « feuille ↗ » sur chaque carte PJ de la colonne Compagnie (dans le produit final, chaque joueur ouvre SA feuille — onglet ou page dédiée). Lien retour « ← retour à la table » en haut. Structure conforme aux règles Héros & Dragons (SRD 5E français — DRS : https://github.com/igwane/heros-et-dragons-drs/tree/master/docs ; feuille papier de référence : https://github.com/DHFTN/BlackBox/blob/main/BlackBox_Complet.pdf).

**Contenu** :

- **En-tête** : nom, citation manuscrite, classe & niveau, race, historique, alignement, XP (x / seuil suivant).
- **Caractéristiques** (colonne 1) : 6 boîtes FOR/DEX/CON/INT/SAG/CHA — gros modificateur en Caveat rouge, valeur brute en petit dessous. **Cliquer lance un test** (d20 + mod). Dessous : Inspiration (toggle cliquable) et bonus de Maîtrise (+3 au niveau 5).
- **Sauvegardes & compétences** (colonne 2) : 6 jets de sauvegarde puis les 18 compétences H&D (Acrobaties, Arcanes, Athlétisme, Discrétion, Dressage, Escamotage, Histoire, Intimidation, Intuition, Investigation, Médecine, Nature, Perception, Persuasion, Religion, Représentation, Survie, Tromperie), chacune avec sa carac de référence, pastille ● maîtrisée / ○ non, modificateur, **ligne cliquable = jet**. Puis Perception passive et bloc langues & maîtrises (armes, armures, outils).
- **Combat** (colonne 3) : CA / Initiative (cliquable → jet) / Vitesse ; bloc PV (barre hachurée + boutons −/+, PV temporaires, dés de vie restants x/niveau × d10, jets contre la mort : 3 pips réussites + 3 pips échecs, cliquables) ; table d'**attaques** (arme, bonus, dégâts, notes — ligne cliquable = jet d'attaque) avec rappel « Attaque supplémentaire » ; bloc **sorts** (DD sauvegarde, bonus d'attaque de sort, carac d'incantation, emplacements par niveau en pips cocher/libérer, sorts connus en chips avec description au survol). Le bloc sorts est masquable via la prop `showSpells` (personnages non lanceurs).
- **Traits & équipement** (colonne 4) : capacités & traits (nom + source « rôdeur 3 » / « elfe » + description courte) ; personnalité (traits / idéal / lien / défaut) ; équipement (bourse po/pa/pc + liste ×quantité, renvoi vers l'onglet Inventaire de la table pour la gestion).
- **Jets** : tout jet affiche un toast fixe bas de page (faces qui défilent puis résultat + détail, critique/échec critique signalés).

**Props** : `showSpells` (boolean, défaut true), `diceDuration` (0,3–2 s, défaut 0,8).

**Édition (à prévoir dans le vrai produit — non implémentée dans le prototype)** :

- La feuille du prototype est en lecture seule hormis : PV (−/+), inspiration, jets contre la mort, emplacements de sorts. Le produit réel doit rendre **tout le reste éditable par le propriétaire de la feuille** (et par le MJ).
- Principe clé : **on n'édite que les données sources, jamais les valeurs dérivées.** Éditables : valeurs brutes des 6 caracs, niveau/classe/race/historique/alignement/XP, maîtrises (cases à cocher sauvegardes + 18 compétences), CA, vitesse, PV max, liste d'attaques (nom, bonus ou « auto », dés de dégâts, notes), sorts connus + emplacements max, capacités & traits (titre, source, description), personnalité, langues & maîtrises, équipement. Calculés automatiquement (jamais saisis) : modificateurs (⌊(valeur−10)/2⌋), bonus de maîtrise selon niveau, sauvegardes/compétences (mod + maîtrise), perception passive, DD et attaque de sorts, seuils d'XP.
- UX d'édition recommandée, cohérente avec le design system : **édition en place** — un mode « ✎ éditer » global (ou par bloc) qui transforme les valeurs en inputs sketchy (bordure 2px encre, focus rouge), les listes (attaques, traits, objets, sorts) avec ajout « + hop » en dashed et suppression ✕, réordonnancement par drag. Pas de page de formulaire séparée.
- Deux niveaux d'assistance : saisie **libre** (tout champ modifiable à la main, indispensable pour l'homebrew) ET saisie **assistée par le compendium DRS** (choisir une classe/race/arme/sort dans le compendium pré-remplit les champs : dés de vie, maîtrises de classe, dégâts d'arme, description de sort…). Le libre prime toujours — une valeur saisie à la main n'est jamais écrasée.
- Création de personnage : assistant pas-à-pas (race → classe → caracs → historique → équipement) alimenté par le DRS, qui produit le même modèle de données que la feuille.
- Montée de niveau : action dédiée (pas une simple édition du champ niveau) proposant les gains du niveau (PV, capacités, sorts, bonus de maîtrise) tout en laissant tout ajuster.
- Toute modification en cours de partie est journalisée sur la table (« Kaelith modifie sa feuille : CA 17 → 18 »), et le MJ peut verrouiller l'édition hors préparation.

**Pour les specs** : les données de la feuille (caracs, maîtrises, PV, sorts, équipement) doivent être le même modèle personnage que l'écran de jeu (PV/inventaire déjà partagés) ; les modificateurs sont dérivés (mod = ⌊(valeur−10)/2⌋, maîtrise selon niveau, sauvegarde/compétence = mod + maîtrise si maîtrisée) ; les jets faits depuis la feuille devront alimenter le journal de la table ; le contenu règles (sorts, capacités, états) doit venir du compendium DRS.

## 1.12 Points pour les specs du vrai produit

- Le prototype est mono-client : le sélecteur de rôle simule le multi-utilisateur. Le produit réel devra synchroniser en temps réel : positions des pions, brouillard (reveals), journal/jets, PV/états, initiative, cartes importées, pings.
- Les jets doivent être exécutés/validés côté serveur (anti-triche), y compris l'initiative lancée par chaque joueur.
- Le brouillard doit être rendu différemment par rôle (MJ semi-transparent, joueurs opaque) à partir des mêmes données.
- L'upload de carte est un dataURL local dans le prototype → prévoir stockage d'assets.
- Personnages, inventaires et sources de règles à connecter au compendium (DRS : https://github.com/igwane/heros-et-dragons-drs, https://fan.heros-et-dragons.com).
- La feuille de personnage (1.11) et l'écran de jeu partagent le même modèle personnage — une seule source de vérité, la feuille n'en est qu'une vue détaillée.

---

# 2. Design System « Carnet crayonné »

Identité : un carnet de jeu de rôle moderne — papier crème, encre, annotations manuscrites, traits « main levée » légèrement irréguliers. Aucune ombre portée lourde, pas de glassmorphism, pas de dégradés décoratifs.

## 2.1 Couleurs

| Usage                                        | Valeur                            |
| -------------------------------------------- | --------------------------------- |
| Papier (fond de page)                        | `#FBF8F0`                         |
| Panneau / carte (surface)                    | `#FFFEF9`                         |
| Quadrillage carte — fond / lignes (pas 32px) | `#F4F0E3` / `#E4DEC9`             |
| Lignes de cahier (pas 28px)                  | `#EFEADB`                         |
| Encre (texte, bordures)                      | `#33302A`                         |
| Encre secondaire                             | `#7C7669`                         |
| Estompé / placeholder                        | `#B5AD98`                         |
| Traits clairs / dashed / filet discret       | `#C6BFAC` / `#A8A08D` / `#D9D3C4` |
| Rouge carmin (accent)                        | `#C0392B`                         |
| Rouge foncé (bordures accent)                | `#8F281D`                         |
| Hachure claire                               | `#D25243`                         |
| Rouge hover                                  | `#A22F23`                         |
| Texte sur rouge                              | `#FFF7EE`                         |
| Liens                                        | `#8A2B20`, hover `#C0392B`        |

Barres de PV : `repeating-linear-gradient(-55deg, #C0392B 0 4px, #D25243 4px 8px)` dans un cadre 2px encre, radius 6px.

## 2.2 Typographie (Google Fonts)

| Rôle                                     | Fonte              | Graisse                                             |
| ---------------------------------------- | ------------------ | --------------------------------------------------- |
| Titres                                   | Cormorant Garamond | 700                                                 |
| Texte courant / UI                       | Spectral           | 400–600                                             |
| Annotations manuscrites, labels ludiques | Caveat             | 500–600 — souvent en `#C0392B` et `rotate(±1.5deg)` |
| Chiffres, dés, stats, timestamps         | IBM Plex Mono      | 400–500                                             |

## 2.3 Le trait « main levée » (signature du système)

- Bordures : `2px solid #33302A` avec border-radius sketchy à 8 valeurs, ex. `255px 15px 225px 15px / 15px 225px 15px 255px`. **Varier les valeurs d'un élément à l'autre** (jamais deux cartes identiques côte à côte).
- Rotations légères (−1,5° à +1°) sur cartes, badges, annotations, chips.
- Secondaire / placeholder / action douce : `2px dashed #A8A08D`.
- Pions : cercles imparfaits (`48% 52% 50% 50% / 52% 48% 52% 48%`).

## 2.4 Composants clés

- **Bouton primaire** : fond `#C0392B`, bordure 2px `#8F281D`, texte `#FFF7EE`, hover `#A22F23`, radius sketchy, parfois `rotate(-1deg)`.
- **Bouton encre** : fond `#33302A`, texte `#FBF8F0`, hover → rouge.
- **Bouton secondaire** : fond `#FFFEF9`, bordure encre, hover inversé (fond encre, texte papier).
- **Bouton fantôme** : transparent, bordure dashed `#A8A08D`, texte `#7C7669` ; hover : encre ou rouge selon le caractère destructif.
- **Chips / badges** : petits radius asymétriques type `10px 3px 12px 3px`, souvent en Caveat.
- **Inputs / selects** : bordure 2px encre, radius sketchy, fond `#FFFEF9` ou `#FBF8F0` ; focus = bordure rouge (pas d'outline) ; placeholder `#B5AD98`.
- **Annotations flottantes** : Caveat rouge, positionnées en absolu au bord des cartes (« à lui de jouer ! », « la bourse »), rotation ~3°.
- **Onglets** : bandes pleines, actif = fond encre / texte papier.
- **Placeholders d'images** : fond rayé ou quadrillé, label IBM Plex Mono entre `⟨ ⟩`, bordure dashed.
- **Séparateurs** : traits 2px `#D9D3C4` légèrement inclinés, ou filets `1px dashed`.

## 2.5 Règles d'usage

- **Styles inline uniquement** (contrainte Design Components) — pas de classes CSS ; seuls `@font-face`/`@keyframes`/resets dans un `<style>` de helmet.
- Pas d'emoji hors glyphes déjà employés : ⚔ ✦ ⚑ ✥ ✎ ▒ ✕ ➤ 🥾 ✒.
- Écrans de consultation (règles/DRS) : denses, 2 colonnes possibles. Écrans de jeu : aérés.
- Desktop d'abord, mode clair uniquement.
- Textes UI en français, ton chaleureux et ludique pour les annotations Caveat (« + hop », « à vos d20 ! »), neutre pour le contenu.

## 2.6 Micro-animations

- Ping carte : `@keyframes hdPing` — anneau qui grandit (scale .25 → 1.8) en s'estompant, 1,8 s ease-out.
- Dé : faces aléatoires toutes les 75 ms + micro-rotations ±5°, arrêt sur le résultat.
- Hovers : simples inversions de couleurs, pas de transitions élaborées.

---

# 3. Compendium intégré (`Compendium.dc.html`)

Feature clé : tout le contenu Héros & Dragons du DRS (https://github.com/igwane/heros-et-dragons-drs/tree/master/docs) est **ingéré, normalisé et réinjecté dans le site** — une seule bibliothèque, un seul format, consultable sans quitter la table.

## 3.1 Source et pipeline d'ingestion

- Structure du repo : `docs/<catégorie>/<slug>/README.md` (ex. `docs/bestiaire/aboleth/`, `docs/grimoire/agrandir-retrecir/`). Chaque fichier = **frontmatter sous forme de tableaux markdown** (y compris tableaux imbriqués : `abilityScores`, `ac`, `skills`, `movement`, `senses`…) + **corps markdown** en sections (`## Capacités`, `## Actions`, `## Actions légendaires`…) avec liens internes relatifs.
- Pipeline (job ré-exécutable) : 1) cloner/puller le repo ; 2) parser chaque README (frontmatter → champs typés, corps → blocs) ; 3) normaliser vers le **schéma canonique** (3.2) ; 4) résoudre les liens internes en slugs de compendium (`[jet de sauvegarde](...)` → lien interne) ; 5) construire l'index de recherche (nom, catégorie, tags, niveau/FP/école/type) ; 6) publier en base + diff versionné (une ré-ingestion ne doit jamais écraser silencieusement).
- Le contenu **homebrew** (créé par le MJ dans le site) utilise exactement le même schéma, avec `source: "maison"`.

## 3.2 Schéma canonique

```js
{
  slug, category,           // 'bestiaire' | 'grimoire' | 'races' | 'classes' | 'historiques'
                            // | 'dons' | 'equipement' | 'objets-magiques' | 'etats' | 'regles'
  title, source, sourcePage,
  meta: { … },              // champs typés par catégorie :
  //  monstre : type, taille, alignement, fp, xp, ca:{valeur,type}, pv:{moyenne,formule},
  //            caracs:{for..cha}, sauvegardes, competences, vitesses, sens, langues,
  //            telepathie, environnements
  //  sort    : niveau, ecole, rituel, incantation, portee, composantes:{v,s,m,materiau},
  //            duree, concentration, classes[]
  //  arme/objet : cout, degats, proprietes, poids… · classe : dv, maitrises, capacites/niveau…
  body: [ { heading, paras:[{lead, text}] } ],   // sections rendues (capacités, actions…)
  visibility: 'public' | 'mj',
  version, hash             // pour le diff de ré-ingestion
}
```

Les `meta` alimentent les usages programmatiques (pré-remplissage, calculs) ; le `body` alimente l'affichage. C'est la même donnée qui sert la fiche, le tooltip et le pré-remplissage.

## 3.3 Usages intégrés dans le site

- **MJ → carte** : « poser sur la carte (PNJ) » depuis une fiche monstre crée le PNJ avec PV (moyenne), CA, init (mod DEX) pré-remplis.
- **Feuille de personnage** : saisie assistée (arme, sort, capacité de classe choisis dans le compendium → champs pré-remplis, cf. §1.11).
- **Tooltips partout** : survol d'un état sur une carte PJ, d'un nom de sort dans le journal → mini-fiche.
- **Partage** : le MJ « partage au journal » une fiche (les joueurs la voient alors, même si sa catégorie est réservée MJ).
- **Recherche globale** (toutes catégories confondues, filtrée par visibilité du rôle).

## 3.4 Visibilité MJ / joueurs

- **Public** (joueurs + MJ) : règles, races, classes, historiques, dons, grimoire, équipement, états.
- **MJ uniquement** : bestiaire, objets magiques — les joueurs ne voient ni la catégorie ni les fiches, sauf **révélation explicite** par le MJ (partage au journal → la fiche devient consultable ; option : révélation partielle, ex. nom + type sans les stats).
- Homebrew : privé MJ par défaut, publiable.
- La visibilité est portée par la donnée (`visibility`), pas par l'UI — l'API ne sert jamais une fiche MJ à un client joueur.

## 3.5 Écran compendium (prototype)

Trois colonnes : **catégories** (rail gauche, compteurs, ✒ = réservé MJ) · **liste** de la catégorie (nom + méta FP/type ou niveau/école, recherche dans la barre haute) · **fiche** (colonne principale, dense).
Deux gabarits de fiche implémentés : **monstre** (bandeau CA/PV/vitesse/FP, 6 caracs, lignes sauvegardes/compétences/sens/langues/source, sections Capacités/Actions/Actions légendaires — exemple : Aboleth) et **sort** (bloc méta incantation/portée/composantes/durée/classes, description — exemple : Agrandir/rétrécir). Les autres catégories affichent le même patron avec placeholder « à l'ingestion ». Sélecteur « vu comme » (prototype) : en vue joueur, bestiaire et objets magiques sont verrouillés. Boutons d'action contextuels : poser sur la carte (monstre, MJ), ajouter à une feuille (sort), partager au journal (MJ). Accès depuis l'écran de jeu : lien « ✦ compendium ↗ » dans la barre de session ; lien retour vers la table.
