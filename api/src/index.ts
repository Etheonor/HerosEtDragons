import { Hono } from "hono";
import { createAuth } from "./auth";
import { createDb, schema } from "./db";
import { asc, eq, and, or, gt } from "drizzle-orm";
import { consumeInvitation } from "./invitations";
import campaigns from "./routes/campaigns";
import characters from "./routes/characters";
import maps from "./routes/maps";
import notes from "./routes/notes";
import npcTemplates from "./routes/npc-templates";
import compendium from "./routes/compendium";
import dev from "./routes/dev";
import { securityHeaders, limitJsonBody, resolveDevUser } from "./middleware";

export { GameTableDO } from "./do/game-table";

const app = new Hono<{ Bindings: Env }>();

// S3 (audit) : CSP, nosniff, Referrer-Policy, X-Frame-Options sur toutes les
// réponses — y compris les 404 de l'API (la SPA statique est servie par ASSETS).
app.use("*", securityHeaders);
// N3 (audit) : coupe les corps JSON trop lourds AVANT le parse de zod.
app.use("*", limitJsonBody);

app.get("/api/health", (c) => c.json({ ok: true, name: "rollwith-hd", time: Date.now() }));

app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  // Mode dev : le client appelle get-session pour connaître son utilisateur.
  // Le bypass couvre déjà requireAuth et le WS, mais pas better-auth — on
  // répond donc ici avec une session synthétique, ce qui évite de mettre la
  // moindre logique « dev » dans le code client.
  if (new URL(c.req.url).pathname === "/api/auth/get-session") {
    const devUser = await resolveDevUser(c.env, c.req.raw);
    if (devUser) {
      return c.json({
        session: {
          id: `dev-${devUser.id}`,
          userId: devUser.id,
          token: "dev",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        user: { ...devUser, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      });
    }
  }

  const auth = createAuth(c.env, c.req.raw);
  const res = await auth.handler(c.req.raw);
  // Le rejet de la whitelist se traduit par une erreur interne mieux-auth →
  // on redirige vers l'accueil avec l'état « refusé » plutôt qu'un 500 brut
  // (design : écran de connexion a un état refus explicit).
  if (res.status >= 500) {
    return c.redirect("/login?denied=1", 302);
  }
  return res;
});

// ── Acceptation d'invitation (publique — audit §3.2) ──────────
// Le lien /join/:token ouvre cette route AVANT login : elle valide le token,
// pose un cookie hd-invite (Lax, 15 min) que le flux OAuth consommera au
// callback ; si l'utilisateur a déjà une session, rejoint directement.
app.get("/api/invitations/:token", async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json({ ok: false, error: "Token manquant" }, 400);

  const db = createDb(c.env.DB);
  const [inv] = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.token, token),
        or(eq(schema.invitations.usesLeft, -1), gt(schema.invitations.usesLeft, 0)),
        gt(schema.invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!inv) return c.json({ ok: false, error: "Invitation invalide ou expirée" }, 404);

  const [campaign] = await db
    .select({ name: schema.campaigns.name })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, inv.campaignId))
    .limit(1);

  const dev = await resolveDevUser(c.env, c.req.raw);
  let session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>> | null =
    null;
  if (!dev) {
    const auth = createAuth(c.env, c.req.raw);
    session = await auth.api.getSession({ headers: c.req.raw.headers });
  }

  if (dev || session) {
    const userId = dev ? dev.id : session!.user.id;
    const [acct] = await db
      .select({ accountId: schema.account.accountId })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "discord")))
      .limit(1);
    const res = await consumeInvitation(db, token, userId, acct?.accountId ?? null);
    if (!res.ok) {
      return c.json(
        {
          ok: false,
          error: res.reason === "exhausted" ? "Invitation épuisée" : "Invitation invalide",
        },
        409,
      );
    }
    return c.json({ ok: true, joined: true, campaignName: campaign?.name ?? "" });
  }

  // Anonyme : on mémorise l'invitation pour la consommer au retour OAuth.
  return c.json(
    { ok: true, joined: false, campaignName: campaign?.name ?? "" },
    {
      headers: {
        "Set-Cookie": `hd-invite=${token}; Path=/; Max-Age=900; HttpOnly; SameSite=Lax`,
      },
    },
  );
});

app.route("/api/campaigns", campaigns);
app.route("/api/characters", characters);
app.route("/api/maps", maps);
app.route("/api/notes", notes);
app.route("/api/npc-templates", npcTemplates);
app.route("/api/compendium", compendium);
// Mode dev : 404 complet si DEV_AUTH n'est pas défini (garde dans le routeur).
app.route("/api/dev", dev);

// WebSocket route for game tables
app.get("/api/tables/:campaignId/ws", async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  // Auth check
  const dev = await resolveDevUser(c.env, c.req.raw);
  let userId: string;
  let userName: string;
  if (dev) {
    userId = dev.id;
    userName = dev.name;
  } else {
    const auth = createAuth(c.env, c.req.raw);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Non authentifié" }, 401);
    userId = session.user.id;
    userName = session.user.name;
  }

  const db = createDb(c.env.DB);
  const [membership] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!membership) return c.json({ error: "Pas membre" }, 403);

  // Get active character
  const [char] = await db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.campaignId, campaignId),
        eq(schema.characters.ownerId, userId),
        eq(schema.characters.active, true),
      ),
    )
    .orderBy(asc(schema.characters.name))
    .limit(1);

  const upgrade = c.req.raw.headers.get("Upgrade");
  if (!upgrade || upgrade !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 426);
  }

  const id = c.env.GAME_TABLE.idFromName(campaignId);
  const stub = c.env.GAME_TABLE.get(id);

  const wsUrl = new URL("https://internal/ws");
  wsUrl.searchParams.set("campaignId", campaignId);
  wsUrl.searchParams.set("userId", userId);
  wsUrl.searchParams.set("name", userName);
  wsUrl.searchParams.set("role", membership.role);
  wsUrl.searchParams.set("charId", char?.id ?? "");
  wsUrl.searchParams.set("color", char?.color ?? "#C0392B");

  return stub.fetch(new Request(`https://internal/ws?${wsUrl.searchParams.toString()}`, c.req.raw));
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
