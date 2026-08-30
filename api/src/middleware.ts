import type { Context, Next } from "hono";
import { createAuth } from "./auth";
import { createDb, schema } from "./db";
import { eq, and } from "drizzle-orm";

export interface AuthVariables {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  discordId: string;
  memberRole: "mj" | "player";
}

export type AppContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

export async function requireAuth(c: AppContext, next: Next) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Non authentifié" }, 401);
  }

  const db = createDb(c.env.DB);
  const acct = await db
    .select()
    .from(schema.account)
    .where(
      and(eq(schema.account.userId, session.user.id), eq(schema.account.providerId, "discord")),
    )
    .limit(1);

  const discordId = acct[0]?.accountId ?? "";

  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
  c.set("discordId", discordId);

  await next();
}

export async function requireMember(c: AppContext, next: Next) {
  const campaignId = c.req.param("campaignId");
  if (!campaignId) {
    return c.json({ error: "Campaign ID manquant" }, 400);
  }
  const db = createDb(c.env.DB);
  const member = await db
    .select()
    .from(schema.members)
    .where(
      and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, c.get("user").id)),
    )
    .limit(1);

  if (member.length === 0) {
    return c.json({ error: "Vous n'êtes pas membre de cette campagne" }, 403);
  }

  c.set("memberRole", member[0]!.role);
  await next();
}

export async function requireMj(c: AppContext, next: Next) {
  const role = c.get("memberRole");
  if (role !== "mj") {
    return c.json({ error: "Réservé au MJ" }, 403);
  }
  await next();
}
