import io
import re

BASE = "docs/atlas-benchmark/"

def lire(n):
    return io.open(BASE + n, encoding="utf-8").read()

def ecrire(n, s):
    io.open(BASE + n, "w", encoding="utf-8").write(s)

def sub(n, vieux, nouveau, obligatoire=True):
    s = lire(n)
    if vieux not in s:
        if obligatoire:
            raise SystemExit("INTROUVABLE dans " + n + " :\n" + vieux[:160])
        return False
    ecrire(n, s.replace(vieux, nouveau))
    return True

# ══════════════════════════════════════════════════════════ 02 ══════════════
sub("02-etat-des-lieux-rollwith.md", """Un indice d'intention tactile existe : `touch-action: none` sur `.map-frame`,
`.map-surface` et `.token`, et `flex-wrap: wrap` sur `.quick-dice` / `.mj-toolbar`.""",
"""`touch-action: none` est posé sur `.map-frame`, `.map-surface` et `.token`, et
`flex-wrap: wrap` sur `.quick-dice` / `.mj-toolbar` — des règles heritagees d'une
epoque ou le produit se voulait utilisable au doigt. Elles ne servent plus a rien
en cible bureau, et ne coûtent rien à laisser.""")

sub("02-etat-des-lieux-rollwith.md", """**1 seul media query** dans tout `web/src` :

```css
@media (max-width: 640px) { .stepper-label { display: none; } }
```

Pas de breakpoints définis, pas de `prefers-reduced-motion`. La table est
**explicitement desktop** : grille à 3 colonnes de largeurs fixes, `height: 100vh`,
`overflow: hidden`.

⚠️ **C'est un problème de fond, pas de détail.** La génération de `CharacterCreateModal` est
explicitement responsive — donc le produit **se veut** mobile — mais la table ne l'est pas du tout. Et notre cible (petit groupe qui se
réunit le soir, souvent souvent souvent souvent sur mobile) rend ça prioritaire.""",
"""**1 seul media query** dans tout `web/src` :

```css
@media (max-width: 640px) { .stepper-label { display: none; } }
```

Pas de breakpoints définis, pas de `prefers-reduced-motion`. La table est
**explicitement desktop** : grille à 3 colonnes de largeurs fixes, `height: 100vh`,
`overflow: hidden`.

**Ce n'est pas un manque.** La cible du produit est un PC de bureau avec un grand
ecran, affiche en local ou via Discord sur son propre poste ; la table se joue au
clavier-souris. Le responsive n'est donc pas un chantier — le `media query`
ci-dessus et les `touch-action` sont des scories d'une'epoque ou le produit se
voulait utilisable au doigt, et peuvent disparaitre.""")

# ══════════════════════════════════════════════════════════ 03 ══════════════
sub("03-axes-ux-ui.md", "- sur mobile, la grille à 3 colonnes fixes est inutilisable.", "")

sub("03-axes-ux-ui.md", """**1 seul media query** dans tout `web/src`. La table est
`height: 100vh` + grille à largeurs fixes → inutilisable sur téléphone.""",
"""**1 seul media query** dans tout `web/src`. La table est `height: 100vh` + grille
à largeurs fixes. Hors cible : le produit se joue au clavier-souris sur un grand
ecran, donc la seule contrainte utile est « tenir dans 1280 px de large sans
devenir illisible », ce que le layout actuel tient deja.""")

sub("03-axes-ux-ui.md", """### Écart

🔴 **Sur mobile, la table est inutilisable.** Et notre cible (un groupe qui se réunit
le soir) est majoritairement sur téléphone.""",
"""### Écart

⚪ **Hors cible.** Le produit ne vise pas le mobile, donc l'absence de responsive
n'est pas un défaut. Le seul point à surveiller reste `height: 100vh` : sur un
grand écran de bureau il faut préférer `100dvh` ou une hauteur calculée, sinon la
barre d'adresse et lesTask-oum la barre du système rognent la table.""")

sub("03-axes-ux-ui.md", """- **Responsive** : c'est une conséquence directe du §1. Une couche map plein écran +
  des panneaux flottants est **naturellement** adaptatif : sur petit écran, les
  panneaux deviennent des feuilles qui montent du bas (bottom sheet), la barre
  d'outils se réduit au strict nécessaire. C'est un argument de plus pour faire le
  §1 — pas un chantier séparé.""",
"""- **Grand écran** : c'est une conséquence directe du §1, et c'est le seul scenario
  à traiter. Une couche map plein écran + des panneaux flottants donne de la place
  au MJ sans rogner le monde ; à l'inverse, il faut verrouiller une **largeur
  minimale** de table (≈ 1180 px) et, en dessous, réduire la barre d'outils par la
  priorité plutôt que par un breakpoint — exactement le mécanisme du §2.""")

# ══════════════════════════════════════════════════════════ 04 ══════════════
sub("04-game-feel.md", """🟡 Un saut de zoom, c'est une désorientation. Sur une petite table sur téléphone,
c'est le geste le plus fréquent → le plus désagréable.""",
"""🟡 Un saut de zoom, c'est une désorientation, et c'est le geste le plus fréquent
de la partie — donc le plus désagréable.""")

io.open("/dev/null", "w").write("")
print("02, 03 et 04 traites")