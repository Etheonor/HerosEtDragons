import { createDb, schema } from "./db";
import { and, eq, gt, or, sql } from "drizzle-orm";

type DB = ReturnType<typeof createDb>;

export interface ConsumeResult {
  ok: boolean;
  reason?: "invalid" | "exhausted";
  campaignId?: string;
}

function inviteTokenFromCookie(request: Request): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)hd-invite=([A-Za-z0-9_-]{8,80})/.exec(cookies);
  return match ? (match[1] ?? null) : null;
}

export { inviteTokenFromCookie };

async function ensureAllowed(db: DB, discordId: string): Promise<void> {
  const [allowed] = await db
    .select()
    .from(schema.allowedUsers)
    .where(eq(schema.allowedUsers.discordId, discordId))
    .limit(1);
  if (!allowed) {
    await db.insert(schema.allowedUsers).values({ discordId, note: "Invitation" });
  }
}

/**
 * Consomme une invitation : décrémente ATOMIQUEMENT usesLeft (audit §5.4 —
 * lecture-écriture = double usage possible sinon), ajoute le membre et
 * l'autorisation Discord. Idempotent si l'utilisateur est déjà membre
 * (aucune consommation dans ce cas).
 */
export async function consumeInvitation(
  db: DB,
  token: string,
  userId: string,
  discordId: string | null,
): Promise<ConsumeResult> {
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
  if (!inv) return { ok: false, reason: "invalid" };

  const [existing] = await db
    .select({ role: schema.members.role })
    .from(schema.members)
    .where(and(eq(schema.members.campaignId, inv.campaignId), eq(schema.members.userId, userId)))
    .limit(1);

  if (existing) {
    // Déjà membre : on s'assure juste qu'il peut se connecter, sans consommer.
    if (discordId) await ensureAllowed(db, discordId);
    return { ok: true, campaignId: inv.campaignId };
  }

  if (inv.usesLeft !== -1) {
    const [decremented] = await db
      .update(schema.invitations)
      .set({ usesLeft: sql`${schema.invitations.usesLeft} - 1` })
      .where(and(eq(schema.invitations.token, token), gt(schema.invitations.usesLeft, 0)))
      .returning({ usesLeft: schema.invitations.usesLeft });
    if (!decremented) return { ok: false, reason: "exhausted" };
  }

  try {
    await db.insert(schema.members).values({ campaignId: inv.campaignId, userId, role: "player" });
  } catch (err) {
    // Contrainte d'unicité (course avec une autre jointure simultanée) :
    // rendre la consommation nulle part.
    const message = err instanceof Error ? err.message : "";
    if (!/UNIQUE|PRIMARY/i.test(message)) throw err;
    if (inv.usesLeft !== -1) {
      await db
        .update(schema.invitations)
        .set({ usesLeft: sql`${schema.invitations.usesLeft} + 1` })
        .where(eq(schema.invitations.token, token));
    }
  }

  if (discordId) await ensureAllowed(db, discordId);
  return { ok: true, campaignId: inv.campaignId };
}
