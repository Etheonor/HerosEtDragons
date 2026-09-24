import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const CAMPAIGN = "dev-camp";

/** Identifiants produits par POST /api/dev/seed. */
export const MJ = "mj";
export const KAELITH = "kaelith";
export const RAGNAR = "ragnar";

/**
 * Re-seed la fixture déterministe, en purgeant au passage l'état du Durable
 * Object (journal, carte active, pions) — sans ça l'état survit d'un run à
 * l'autre et les tests deviennent ordonnés-par-hasard.
 */
export async function seed(request: APIRequestContext) {
  const res = await request.post("/api/dev/seed", { data: { reset: true } });
  expect(res.ok(), "seed dev : la variable DEV_AUTH=1 doit être dans .dev.vars").toBeTruthy();
  return res.json();
}

/** Pose le cookie du bypass d'auth pour un utilisateur dev. */
export async function login(page: Page, user: string) {
  const res = await page.request.post("/api/dev/login", { data: { user } });
  expect(res.ok()).toBeTruthy();
}

/** Connecte, seed, et ouvre la table de la campagne. */
export async function openTable(page: Page, user: string) {
  await seed(page.request);
  await login(page, user);
  await page.goto(`/campaigns/${CAMPAIGN}/table`);
  // On attend un élément présent pour TOUT le monde (le panneau à onglets) :
  // la barre d'outils n'existe que pour le MJ.
  await expect(page.getByRole("button", { name: "Journal" })).toBeVisible();
}

/** Le store WS est-il connecté (pastille / titre de session) ? */
export async function waitConnected(page: Page) {
  await expect(page.getByText(/Mode exploration|Tour suivant|à vos d20/)).toBeVisible();
}
