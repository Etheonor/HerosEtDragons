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
  await d
    .insert(schema.characters)
    .values({
      id: "rest-pj",
      campaignId: CAMPAIGN,
      ownerId: OTHER,
      kind: "pj",
      name: "Héros",
      color: "#111",
      sheet: createSheet({ identite: { nom: "Héros" } }),
      pv: 10,
      pvMax: 10,
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

  it("la liste des campagnes porte les PJ de l'utilisateur courant", async () => {
    type Row = { id: string; myCharacters: { id: string; name: string }[] };
    const asPlayer = (await (await get("/api/campaigns", OTHER)).json()) as { campaigns: Row[] };
    const playerRow = asPlayer.campaigns.find((c) => c.id === CAMPAIGN);
    expect(playerRow?.myCharacters).toEqual([{ id: "rest-pj", name: "Héros" }]);

    const asMj = (await (await get("/api/campaigns", MISTRESS)).json()) as { campaigns: Row[] };
    expect(asMj.campaigns.find((c) => c.id === CAMPAIGN)?.myCharacters).toEqual([]);
  });

  it("un joueur reçoit 403 sur une route MJ (invitations, création de carte, undo)", async () => {
    const inv = await post(`/api/campaigns/${CAMPAIGN}/invitations`, {}, OTHER);
    expect(inv.status).toBe(403);

    const undo = await post(`/api/campaigns/${CAMPAIGN}/undo`, {}, OTHER);
    expect(undo.status).toBe(403);

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

    // Undo sur une pile vide : la route répond l'état d'historique, pas une erreur.
    const undo = await post(`/api/campaigns/${CAMPAIGN}/undo`, {}, MISTRESS);
    expect(undo.status).toBe(200);
    expect(await undo.json()).toEqual({ canUndo: false, canRedo: false });
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

describe("REST — feuilles de PNJ réservées au MJ (B5 étendu)", () => {
  beforeEach(async () => {
    await seedWorld();
  });

  it("un joueur reçoit 403 sur le détail d'un PNJ, le MJ le lit", async () => {
    expect((await get("/api/characters/rest-pnj", OTHER)).status).toBe(403);
    expect((await get("/api/characters/rest-pnj", MISTRESS)).status).toBe(200);
  });

  it("un joueur lit toujours la fiche d'un PJ (la sienne ou celle d'un autre)", async () => {
    expect((await get("/api/characters/rest-pj", OTHER)).status).toBe(200);
    expect((await get("/api/characters/rest-pj", MISTRESS)).status).toBe(200);
  });

  it("la liste d'une campagne masque les PNJ aux joueurs, pas au MJ", async () => {
    const asPlayer = (await (await get(`/api/characters/campaigns/${CAMPAIGN}`, OTHER)).json()) as {
      characters: { id: string }[];
    };
    expect(asPlayer.characters.map((c) => c.id)).toEqual(["rest-pj"]);

    const asMj = (await (await get(`/api/characters/campaigns/${CAMPAIGN}`, MISTRESS)).json()) as {
      characters: { id: string }[];
    };
    expect(asMj.characters.map((c) => c.id).sort()).toEqual(["rest-pj", "rest-pnj"]);
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

describe("REST — recherche compendium : les jokers LIKE sont échappés (audit P4)", () => {
  beforeEach(async () => {
    await seedWorld();
    const d = await db();
    await d
      .insert(schema.compendiumEntries)
      .values({
        key: "bestiaire/gobelin",
        category: "bestiaire",
        slug: "gobelin",
        title: "Gobelin",
        searchText: "gobelin creature monstrueuse",
        sortKey: "gobelin",
        hash: "test",
      })
      .onConflictDoNothing();
  });

  it("une recherche « % » ne matche plus tout, « _ » n'est plus un joker", async () => {
    const pct = (await (
      await get(`/api/compendium/entries?campaign=${CAMPAIGN}&q=%25`, OTHER)
    ).json()) as { total: number };
    expect(pct.total).toBe(0);

    const underscore = (await (
      await get(`/api/compendium/entries?campaign=${CAMPAIGN}&q=gob_lin`, OTHER)
    ).json()) as { total: number };
    expect(underscore.total).toBe(0);
  });

  it("la recherche normale (casse et accents pliés) matche toujours", async () => {
    const hit = (await (
      await get(`/api/compendium/entries?campaign=${CAMPAIGN}&q=Gob%C3%A9lin`, OTHER)
    ).json()) as { total: number };
    expect(hit.total).toBe(1);
  });
});

describe("REST — createAuth mémoïsé (audit P4)", () => {
  it("même origine + même cookie : même instance ; cookie d'invitation : instance distincte", async () => {
    const { createAuth } = await import("../src/auth");
    const a = createAuth(env, new Request("https://localhost/api/campaigns"));
    const b = createAuth(env, new Request("https://localhost/api/campaigns"));
    expect(a).toBe(b);

    const c = createAuth(
      env,
      new Request("https://localhost/api/campaigns", {
        headers: { cookie: "hd-invite=abcdefgh12345678" },
      }),
    );
    expect(c).not.toBe(a);
    const d = createAuth(
      env,
      new Request("https://localhost/api/campaigns", {
        headers: { cookie: "hd-invite=abcdefgh12345678" },
      }),
    );
    expect(d).toBe(c);
  });
});

describe("REST — images d'illustration (fenêtre « Illustration »)", () => {
  beforeEach(async () => {
    await seedWorld();
  });

  function pngFile(): File {
    // Signature PNG minimale : le sniff ne lit que les magic bytes.
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return new File([bytes], "test.png", { type: "image/png" });
  }

  function uploadImage(user: string, name: string, file: File) {
    const form = new FormData();
    form.set("name", name);
    form.set("image", file);
    return SELF.fetch(`https://localhost/api/campaigns/${CAMPAIGN}/images`, {
      method: "POST",
      headers: { Cookie: `hd-dev-user=${user}` },
      body: form,
    });
  }

  // NB : l'upload VALIDE, le service du fichier et la suppression MJ touchent R2
  // et sont couverts en e2e (le pool vitest échoue sur l'isolation R2 dès
  // qu'un objet est écrit). Ici : autorisation et validation, sans écriture.
  it("upload réservé au MJ et contenu sniffé", async () => {
    expect((await uploadImage(OTHER, "Interdite", pngFile())).status).toBe(403);

    const fake = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    expect((await uploadImage(MISTRESS, "Fausse", fake)).status).toBe(400);
  });

  it("liste pour les membres, renommage et suppression réservés au MJ", async () => {
    const d = await db();
    await d
      .insert(schema.campaignImages)
      .values({
        id: "img-rest",
        campaignId: CAMPAIGN,
        name: "Parchemin",
        r2Key: "images/rest-camp/img-rest",
      })
      .onConflictDoNothing();

    const list = (await (await get(`/api/campaigns/${CAMPAIGN}/images`, OTHER)).json()) as {
      images: { id: string; name: string }[];
    };
    expect(list.images.map((i) => i.id)).toContain("img-rest");

    expect((await patch(`/api/images/img-rest`, { name: "Autre" }, OTHER)).status).toBe(403);
    const renamed = await patch(`/api/images/img-rest`, { name: "Vieux grimoire" }, MISTRESS);
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { name: string }).name).toBe("Vieux grimoire");

    // Un joueur ne supprime pas (refus AVANT tout accès R2).
    const del = await SELF.fetch("https://localhost/api/images/img-rest", {
      method: "DELETE",
      headers: { Cookie: `hd-dev-user=${OTHER}` },
    });
    expect(del.status).toBe(403);
  });
});
