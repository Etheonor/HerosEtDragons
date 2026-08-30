import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb, schema } from "./db";
import { eq, and } from "drizzle-orm";
import { consumeInvitation, inviteTokenFromCookie } from "./invitations";

export function createAuth(env: Env, request: Request) {
  const db = createDb(env.DB);

  const baseURL = new URL(request.url).origin;

  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (data: { userId: string }) => {
            const userId = data.userId;

            const acct = await db
              .select()
              .from(schema.account)
              .where(
                and(eq(schema.account.userId, userId), eq(schema.account.providerId, "discord")),
              )
              .limit(1);

            if (acct.length === 0) {
              throw new Error("Aucun compte Discord associé");
            }

            const discordId = acct[0]!.accountId;

            const allowed = await db
              .select()
              .from(schema.allowedUsers)
              .where(eq(schema.allowedUsers.discordId, discordId))
              .limit(1);

            // Invitations fraîches dans le cookie hd-invite (posé par
            // GET /api/invitations/:token avant le redirect OAuth) : on les
            // consomme ici — un utilisateur déjà autorisé qui clique un nouveau
            // lien rejoint la campagne, un nouvel utilisateur devient autorisé.
            const token = inviteTokenFromCookie(request);
            if (token) {
              try {
                await consumeInvitation(db, token, userId, discordId);
              } catch {
                /* best effort : le login reste soumis à la whitelist */
              }
              const after = await db
                .select()
                .from(schema.allowedUsers)
                .where(eq(schema.allowedUsers.discordId, discordId))
                .limit(1);
              if (after.length > 0) return;
            }

            if (allowed.length === 0) {
              throw new Error(
                "Votre compte Discord n'est pas autorisé. Demandez une invitation à votre MJ.",
              );
            }
          },
        },
      },
      user: {
        create: {
          after: async (data: { id: string }) => {
            const userId = data.id;

            const acct = await db
              .select()
              .from(schema.account)
              .where(
                and(eq(schema.account.userId, userId), eq(schema.account.providerId, "discord")),
              )
              .limit(1);

            if (acct.length === 0) return;
            const discordId = acct[0]!.accountId;

            // Nouvelle venue via un lien d'invitation : le cookie hd-invite
            // porte le token jusqu'ici (le header X-Invitation-Token ne
            // survit jamais au redirect OAuth — audit §3.2).
            const token = inviteTokenFromCookie(request);
            if (!token) return;

            try {
              await consumeInvitation(db, token, userId, discordId);
            } catch {
              /* best effort */
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
