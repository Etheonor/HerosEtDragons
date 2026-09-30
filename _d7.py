import io

# ═══════════════════════════════════════════════════ 08 : notes marginales ═══
p = "docs/atlas-benchmark/08-recherche-stack-ui.md"
s = io.open(p, encoding="utf-8").read()

# 08 est un releve de recherche brut : on garde les constats de bibliotheque
# (ils sont verifiables) mais on retire ce qui n'a plus d'objet pour nous.
remplacements = [
(
"""7. **Responsive mobile** — sous un breakpoint, les panneaux deviennent des feuilles bottom-sheet pleine largeur (une seule à la fois). C'est une exigence de design, pas une fonctionnalité de lib.""",
"""7. **Adaptation a la largeur** — sous un breakpoint, les panneaux deviennent des feuilles pleine largeur (une seule à la fois). **Sans objet ici** : la cible est un PC de bureau (cf. `07` §Lot 9), donc la seule contrainte est de tenir dans ≈ 1180 px.""",
),
(
"""2. **Le pin pinch-zoom mobile** exige de suivre **plusieurs `pointerId` simultanément** et de calculer une distance. C'est ~40 lignes ; une lib le fait, mais on perdrait le contrôle du momentum et du clamp.""",
"""2. **Le pincement au trackpad** exige de suivre **plusieurs `pointerId` simultanément** et de calculer une distance. C'est ~40 lignes ; une lib le fait, mais on perdrait le contrôle du clamp.""",
),
(
"""**Recommandation :** écrire maison le contrôleur de pan/zoom et le shell de panneau. Évaluer `@neodrag/svelte` **seulement** si le drag de panneau devient pénible (il ne gère pas le resize de toute façon, donc on ne nous fait gagner que ~30 % du travail). Pour le mobile, `svelte-gestures` est un raccourci raisonnable mais son dernier commit date de septembre 2025 — à tester.""",
"""**Recommandation :** écrire maison le contrôleur de pan/zoom et le shell de panneau. Évaluer `@neodrag/svelte` **seulement** si le drag de panneau devient pénible (il ne gère pas le resize de toute façon, donc on ne nous fait gagner que ~30 % du travail).""",
),
(
"""| **`popover` natif** (top layer)                                                | La seule solution qui résout le `transform: scale()` *nativement* et *According à la spec*. Zéro dépendance. Zéro `z-index` à gérer. Utiliser en complément de bits-ui pour les cas simples (bulles d'aide, indications, sheets mobile) |""",
"""| **`popover` natif** (top layer)                                                | La seule solution qui résout le `transform: scale()` *nativement* et *selon la spec*. Zéro dépendance. Zéro `z-index` à gérer. Utiliser en complément de bits-ui pour les cas simples (bulles d'aide, indications) |""",
),
(
"""| `svelte-gestures` 5.2.2           | Si le pinch-zoom mobile mérite un raccourci. Attention : dernier commit 2025-09   |""",
"""| `svelte-gestures` 5.2.2           | Si le pincement au trackpad mérite un raccourci. Attention : dernier commit 2025-09 |""",
),
(
"""| **Contrôleur de pan/zoom de la carte** — pointer capture, wheel, pinch 2 doigts, clamp, inertie optionnelle  | ~120 l. | Composition avec la couche carte + coordonnées ; une lib masque exactement ce dont on a besoin |""",
"""| **Contrôleur de pan/zoom de la carte** — pointer capture, wheel, pincement, clamp   | ~120 l. | Composition avec la couche carte + coordonnées ; une lib masque exactement ce dont on a besoin |""",
),
(
"""- ⚠️ **`contextmenu` sur mobile** : le clic droit n'existe pas. Prévoir un appui long (long-press) ou une poignée explicite. `bits-ui/ContextMenu` gère le long-press pour le tactile d'après son code interne, mais à vérifier sur appareil réel.
""",
"""",
),
(
"""| [`svelte-gestures`](https://github.com/Rezi/svelte-gestures) | 5.2.2 | 2025-09-21 | pan/pinch/press/rotate/swipe/tap/multitouch | basé sur les **attachments** Svelte 5 |""",
"""| [`svelte-gestures`](https://github.com/Rezi/svelte-gestures) | 5.2.2 | 2025-09-21 | pan/pinch/press/rotate/swipe/tap | basé sur les **attachments** Svelte 5 |""",
),
]

for vieux, neuf in remplacements:
    if vieux in s:
        s = s.replace(vieux, neuf)
    else:
        print("  (deja absent ou different) : " + vieux[:70].replace("\n", " "))

# la mention dans les avantages de svelte-command-palette
s = s.replace(
    "groupes, `emptyState` en snippet, bottom-sheet sur mobile.",
    "groupes, `emptyState` en snippet.",
)

io.open(p, "w", encoding="utf-8").write(s)
print("08 nettoye")