export interface TutorialStep {
  target: string;
  title: string;
  text: string;
}

/** Les 4 étapes du tutoriel MJ, ciblées par sélecteur CSS (spotlight). */
export const MJ_TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: ".group-rail",
    title: "La compagnie",
    text: "Vos PJ et les PNJ de la scène, avec leurs PV en direct. Clic : cibler (MJ) ou recentrer. Double-clic : recentrer ou placer. Clic droit : tout le reste.",
  },
  {
    target: ".mj-toolbar",
    title: "Les outils",
    text: "Déplacer, PNJ, repères, brouillard. Le raccourci s’affiche au survol de chaque outil.",
  },
  {
    target: ".map-hud",
    title: "Zoom et dés",
    text: "Le HUD cadre la carte et règle le zoom. Le bouton rouge ouvre la fenêtre des dés (raccourci D).",
  },
  {
    target: ".top-actions",
    title: "Commandes et aide",
    text: "Espace ouvre la command palette — tout s’y trouve. ? affiche l’aide clavier.",
  },
];
