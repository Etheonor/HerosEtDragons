import io

BASE = "docs/atlas-benchmark/"

def lire(n):
    return io.open(BASE + n, encoding="utf-8").read()

def ecrire(n, s):
    io.open(BASE + n, "w", encoding="utf-8").write(s)

def sub(n, vieux, nouveau, optionnel=False):
    s = lire(n)
    if vieux not in s:
        if optionnel:
            return False
        raise SystemExit("INTROUVABLE dans " + n + " :\n---\n" + vieux[:220] + "\n---")
    ecrire(n, s.replace(vieux, nouveau))
    return True

# ══════════════════════════════════════════════════════════ 03 ══════════════
sub("03-axes-ux-ui.md", "\n- sur mobile, la grille à 3 colonnes fixes est inutilisable.\n", "\n")
sub("03-axes-ux-ui.md", "## 14. Responsive et accessibilité", "## 14. Grand écran et accessibilité")
sub(
    "03-axes-ux-ui.md",
    "`height: 100vh` + grille à largeurs fixes → inutilisable sur téléphone.",
    "`height: 100vh` + grille à largeurs fixes. La cible est un bureau, donc ce n'est pas\n"
    "un défaut — mais `100vh` ignore la barre des tâches Windows et le Dock macOS, qui\n"
    "rognent la table.",
)
sub(
    "03-axes-ux-ui.md",
    """🔴 **Sur mobile, la table est inutilisable.** Et notre cible (un groupe qui se réunit
le soir) est majoritairement sur téléphone.""",
    """⚪ **Hors cible, donc pas un écart.** Le produit se joue au clavier-souris sur un PC
de bureau avec un grand écran. Le seul point à corriger reste la hauteur.""",
    optionnel=True,
)
sub(
    "03-axes-ux-ui.md",
    """- **Responsive** : c'est une conséquence directe du §1. Une couche map plein écran +
  des panneaux flottants est **naturellement** adaptatif : sur petit écran, les
  panneaux deviennent des feuilles qui montent du bas (bottom sheet), la barre
  d'outils se réduit au strict nécessaire. C'est un argument de plus pour faire le
  §1 — pas un chantier séparé.""",
    """- **Grand écran** : c'est le seul scénario de largeur à traiter, et c'est une
  conséquence directe du §1. Une couche map plein écran + des panneaux flottants
  rend de la place au MJ sans rogner le monde. À faire : fixer une **largeur
  minimale de table** (≈ 1180 px) et, en dessous, réduire la barre d'outils **par
  la priorité** — le mécanisme du §2 — plutôt que par un media query.""",
)
sub(
    "03-axes-ux-ui.md",
    "| §14 Responsive / a11y | 🔴 P0 (responsive) | conséquence du §1 |",
    "| §14 Grand écran / a11y | 🟡 hauteur + 🟡 a11y | `100dvh`, focus, clavier |",
)

# ══════════════════════════════════════════════════════════ 04 ══════════════
sub(
    "04-game-feel.md",
    """🟡 Un saut de zoom, c'est une désorientation. Sur une petite table sur téléphone,
c'est le geste le plus fréquent → le plus désagréable.""",
    """🟡 Un saut de zoom, c'est une désorientation — et c'est le geste le plus fréquent
de la partie, donc le plus désagréable.""",
)

print("03 et 04 : references mobiles retirees")