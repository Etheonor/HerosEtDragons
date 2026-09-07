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
  memberRole: "mj" | "player";
  membership: { campaignId: string; role: "mj" | "player" } | null;
  /** Posée par les résolveurs de requireMemberOf (charCampaign, mapCampaign,
   *  templateCampaign…) quand ils ont déjà chargé la ligne complète — le
   *  handler la relit au lieu de refaire le SELECT (audit N2). */
  character?: typeof schema.characters.$inferSelect;
  map?: typeof schema.maps.$inferSelect;
  npcTemplate?: typeof schema.npcTemplates.$inferSelect;
}

export type AppContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

export async function requireAuth(c: AppContext, next: Next) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Non authentifié" }, 401);
  }

  // discordId n'est utile qu'à POST /campaigns/join/:token (audit N2) : plus
  // de SELECT account sur chaque requête authentifiée, la route le charge elle-même.
  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
  c.set("membership", null);

  await next();
}

/**
 * Vérifie que l'utilisateur est membre de la campagne — le campaignId vient
 * du paramètre `:campaignId`, du paramètre `campaign` (query), ou d'un
 * résolveur qui charge l'objet parent (char/map/template…) quand la route
 * est adressée par l'id de la ressource. Pose memberRole + membership.
 */
export function requireMemberOf(
  resolve: (c: AppContext) => Promise<string | null | undefined> | string | null | undefined,
): (c: AppContext, next: Next) => Promise<Response | void> {
  return async (c, next) => {
    const campaignId = await resolve(c);
    if (!campaignId) {
      return c.json({ error: "Campaign ID manquant" }, 400);
    }

    const db = createDb(c.env.DB);
    const [member] = await db
      .select({ role: schema.members.role })
      .from(schema.members)
      .where(
        and(eq(schema.members.campaignId, campaignId), eq(schema.members.userId, c.get("user").id)),
      )
      .limit(1);

    if (!member) {
      return c.json({ error: "Vous n'êtes pas membre de cette campagne" }, 403);
    }

    c.set("memberRole", member.role);
    c.set("membership", { campaignId, role: member.role });
    await next();
  };
}

export async function requireMj(c: AppContext, next: Next) {
  const role = c.get("memberRole");
  if (role !== "mj") {
    return c.json({ error: "Réservé au MJ" }, 403);
  }
  await next();
}

/**
 * S3 (audit) : en-têtes de sécurité appliqués à toutes les réponses de l'API.
 * CSP « filet » volontairement permissif pour ne pas casser la SPA SvelteKit
 * (scripts/styles inline de bootstrap) ni les avatars Discord (https:) ni le
 * WebSocket (wss:) — l'objectif est un garde-fou de base, pas une politique dure.
 */
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' wss: https:; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'",
  );
}

/** Borne supérieure d'un corps JSON (audit N3). Le garde-fou de taille sur
 *  PUT /sheet avait sauté : zod parse le corps avant toute vérification, donc
 *  le JSON.parse d'un corps de plusieurs Mo a quand même lieu. On le coupe en
 *  amont via Content-Length. */
export const MAX_JSON_BODY_BYTES = 200_000;

export async function limitJsonBody(c: Context, next: Next) {
  const ct = c.req.header("content-type") ?? "";
  // On ne borne QUE les corps JSON : les uploads multipart (images de carte,
  // jusqu'à 8 Mo) ne doivent pas être rejetés ici.
  if (ct.includes("application/json")) {
    const len = c.req.header("content-length");
    if (len) {
      const bytes = Number(len);
      if (Number.isFinite(bytes) && bytes > MAX_JSON_BODY_BYTES) {
        return c.json({ error: "Corps de requête trop volumineux" }, 413);
      }
    }
  }
  await next();
}
