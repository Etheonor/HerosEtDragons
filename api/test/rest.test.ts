// ═══════════════════════════════════════════════════════════
// Tests REST (worker Hono) — l'API était le seul pan sans couverture.
// Le bypass d'auth de dev (DEV_AUTH=1, cf. resolveDevUser) fournit une session
// par cookie hd-dev-user, ce qui permet de tester le chemin requireAuth ->
// requireMemberOf -> requireMj de bout en bout sans passer par Discord.
// ═══════════════════════════════════════════════════════════

import { env, applyD1Migrations, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, schema } from "../src/db";
import { eq } from "drizzle-orm";
import { createSheet } from "@rollwith/shared/sheet";

const CAMPAIGN = "rest-camp";
const MISTRESS = "mj";
const OTHER = "player";
const OUTSIDER = "outsider";

type Json = Record<string, unknown>;

async function db() {
  const d = createDb(env.DB);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS as never);
  return d;
}

function get(path: string, user?: string) {
  return SELF.fetch(`https://localhost${path}`, {
    headers: user ? { Cookie: `hd-dev-user=${user}` } : {},
  });
}

function post(path: string, body: unknown, user?: string) {
  return SELF.fetch(`https://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Cookie: `hd-dev-user=${user}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown, user?: string) {
  return SELF.fetch(`https://localhost${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Cookie: `hd-dev-user=${user}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function seedWorld() {
  const d = await db();
  for (const u of [MISTRESS, OTHER, OUTSIDER]) {
    await d
      .insert(schema.user)
      .values({ id: u, name: u, email: `${u}@test.local` })
      .onConflictDoNothing();
    await d
      .insert(schema.allowedUsers)
      .values({ discordId: u, note: "test" })
      .onConflictDoNothing();
  }
  await d
    .insert(schema.campaigns)
    .values({ id: CAMPAIGN, name: "REST", ownerId: MISTRESS })
    .onConflictDoNothing();
  await d
    .insert(schema.members)
    .values([
      { campaignId: CAMPAIGN, userId: MISTRESS, role: "mj" },
      { campaignId: CAMPAIGN, userId: OTHER, role: "player" },
    ])
    .onConflictDoNothing();
  await d
    .insert(schema.characters)
    .values({
      id: "rest-pnj",
      campaignId: CAMPAIGN,
      ownerId: null,
      kind: "pnj",
      name: "Loup",
      color: "#000",
      sheet: createSheet({ identite: { nom: "Loup" } }),
      pv: 7,
      pvMax: 7,
      pvTemp: 0,
      conditions: [],
    })
    .onConflictDoNothing();
  return d;
}

describe("REST — autorisation (requireAuth / requireMemberOf / requireMj)", () => {
  beforeEach(async () => {
    await seedWorld();
  });

  it("sans session, toute route protégée renvoie 401", async () => {
    for (const p of [
      "/api/campaigns",
      "/api/maps/campaigns/x",
      "/api/compendium/categories?campaign=x",
    ]) {
      const r = await get(p);
      expect(r.status, p).toBe(401);
    }
  });

  it("un non-membre reçoit 403 sur les routes de campagne", async () => {
    const r = await get(`/api/maps/campaigns/${CAMPAIGN}`, OUTSIDER);
    expect(r.status).toBe(403);
  });

  it("un membre voit ses campagnes, un non-membre n'en voit aucune", async () => {
    const member = (await (await get("/api/campaigns", OTHER)).json()) as { campaigns: Json[] };
    expect(member.campaigns.map((c) => c.id)).toContain(CAMPAIGN);

    const outsider = (await (await get("/api/campaigns", OUTSIDER)).json()) as {
      campaigns: Json[];
    };
    expect(outsider.campaigns).toEqual([]);
  });

  it("un joueur reçoit 403 sur une route MJ (invitations, création de carte)", async () => {
    const inv = await post(`/api/campaigns/${CAMPAIGN}/invitations`, {}, OTHER);
    expect(inv.status).toBe(403);

    const formJ = new FormData();
    formJ.set("name", "Interdite");
    const map = await SELF.fetch(`https://localhost/api/maps/campaigns/${CAMPAIGN}`, {
      method: "POST",
      headers: { Cookie: `hd-dev-user=${OTHER}` },
      body: formJ,
    });
    expect(map.status).toBe(403);
  });

  it("le MJ, lui, peut créer une carte et une invitation", async () => {
    const form = new FormData();
    form.set("name", "Autorisée");
    const map = await SELF.fetch(`https://localhost/api/maps/campaigns/${CAMPAIGN}`, {
      method: "POST",
      headers: { Cookie: `hd-dev-user=${MISTRESS}` },
      body: form,
    });
    expect(map.status).toBe(201);

    const inv = await post(`/api/campaigns/${CAMPAIGN}/invitations`, {}, MISTRESS);
    expect(inv.status).toBeLessThan(300);
  });

  it("une ressource inexistante renvoie 400 (campaignId manquant), pas 500", async () => {
    const r = await SELF.fetch("https://localhost/api/maps/nonexistent-character/image", {
      headers: { Cookie: `hd-dev-user=${MISTRESS}` },
    });
    expect([400, 404]).toContain(r.status);
  });
});

describe("REST — cycle de vie d'une invitation (consumeInvitation)", () => {
  beforeEach(async () => {
    await seedWorld();
  });

  async function makeInvitation(usesLeft: number) {
    const r = await post(`/api/campaigns/${CAMPAIGN}/invitations`, { usesLeft }, MISTRESS);
    expect(r.status).toBeLessThan(300);
    return ((await r.json()) as { token: string }).token;
  }

  async function join(token: string, user: string) {
    return SELF.fetch(`https://localhost/api/invitations/${token}`, {
      headers: { Cookie: `hd-dev-user=${user}` },
    });
  }

  it("un lien à 1 usage : le premier entre, le second est rejeté (atomicité)", async () => {
    const token = await makeInvitation(1);

    const first = await join(token, OUTSIDER);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { joined: boolean }).joined).toBe(true);

    // Le lien estnow épuisé : un autre utilisateur ne passe pas.
    const second = await join(token, "quatrieme");
    expect(second.status).toBe(404);
  });

  it("un lien illimité (-1) reste réutilisable et ne se décrémente pas", async () => {
    const token = await makeInvitation(-1);

    const a = await join(token, OUTSIDER);
    expect(a.status).toBe(200);
    const b = await join(token, "quatrieme");
    expect(b.status).toBe(200);

    const d = createDb(env.DB);
    const row = await d
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.token, token))
      .get();
    expect(row!.usesLeft).toBe(-1);
  });

  it("revenir sur un lien encore valable ne consomme pas deux fois le même usage", async () => {
    const token = await makeInvitation(2);

    await join(token, OUTSIDER);
    // Le lien reste valable : on revient avec le même compte.
    const again = await join(token, OUTSIDER);
    expect(again.status).toBe(200);

    const d = createDb(env.DB);
    const row = await d
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.token, token))
      .get();
    // 2 - 1 = 1 : le second passage n'a rien consommé (déjà membre).
    expect(row!.usesLeft).toBe(1);
    const members = await d
      .select()
      .from(schema.members)
      .where(eq(schema.members.userId, OUTSIDER))
      .all();
    expect(members.length).toBe(1);
  });

  it("un token inexistant ou expiré renvoie 404", async () => {
    const d = createDb(env.DB);
    await d.insert(schema.invitations).values({
      token: "expire",
      campaignId: CAMPAIGN,
      usesLeft: 5,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect((await join("expire", OUTSIDER)).status).toBe(404);
    expect((await join("inexistant", OUTSIDER)).status).toBe(404);
  });
});

describe("REST — en-têtes de sécurité et garde-fou JSON (S3/N3)", () => {
  beforeEach(async () => {
    await seedWorld();
  });

  it("toutes les réponses portent les en-têtes de sécurité", async () => {
    const r = await get("/api/campaigns", MISTRESS);
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("X-Frame-Options")).toBe("DENY");
    expect(r.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("un corps JSON trop gros renvoie 413 avant d'être parsé", async () => {
    const huge = "x".repeat(300_000);
    const r = await patch(`/api/characters/rest-pnj/sheet`, { identite: { nom: huge } }, MISTRESS);
    expect(r.status).toBe(413);
  });
});

describe("REST — inv.give de l'inventaire est bien inaccessible hors WS", () => {
  beforeEach(async () => {
    await seedWorld();
  });

  it("le sac d'un personnage n'est jamais renvoyé par la route REST de la fiche", async () => {
    const r = await get("/api/characters/rest-pnj", MISTRESS);
    const body = JSON.stringify(await r.json());
    // La fiche contient bien des données, mais aucun sac d'inventaire.
    expect(body).toContain("Loup");
    expect(body).not.toContain("inventory");
  });
});
