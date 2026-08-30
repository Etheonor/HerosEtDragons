import { Hono } from "hono";
import { createAuth } from "./auth";
import { createDb, schema } from "./db";
import { asc, eq, and } from "drizzle-orm";
import campaigns from "./routes/campaigns";
import characters from "./routes/characters";
import maps from "./routes/maps";

export { GameTableDO } from "./do/game-table";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, name: "rollwith-hd", time: Date.now() }));

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw);
  return auth.handler(c.req.raw);
});

app.route("/api/campaigns", campaigns);
app.route("/api/characters", characters);
app.route("/api/maps", maps);

// WebSocket route for game tables
app.get("/api/tables/:campaignId/ws", async (c) => {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) return c.json({ error: "Campaign ID manquant" }, 400);

  // Auth check
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Non authentifié" }, 401);

  const db = createDb(c.env.DB);
  const [membership] = await db
    .select()
    .from(schema.members)
    .where(
      and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, session.user.id)),
    )
    .limit(1);

  if (!membership) return c.json({ error: "Pas membre" }, 403);

  // Get active character
  const [char] = await db
    .select()
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.campaignId, campaignId),
        eq(schema.characters.ownerId, session.user.id),
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
  wsUrl.searchParams.set("userId", session.user.id);
  wsUrl.searchParams.set("name", session.user.name);
  wsUrl.searchParams.set("role", membership.role);
  wsUrl.searchParams.set("charId", char?.id ?? "");
  wsUrl.searchParams.set("color", char?.color ?? "#C0392B");

  return stub.fetch(new Request(`https://internal/ws?${wsUrl.searchParams.toString()}`, c.req.raw));
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
