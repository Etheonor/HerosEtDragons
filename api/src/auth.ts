import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb, schema } from "./db";
import { eq, and, gt } from "drizzle-orm";

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

            if (acct.length > 0) {
              const discordId = acct[0]!.accountId;
              const existing = await db
                .select()
                .from(schema.allowedUsers)
                .where(eq(schema.allowedUsers.discordId, discordId))
                .limit(1);

              if (existing.length === 0) {
                const pendingToken = request.headers.get("X-Invitation-Token");

                if (pendingToken) {
                  const inv = await db
                    .select()
                    .from(schema.invitations)
                    .where(
                      and(
                        eq(schema.invitations.token, pendingToken),
                        gt(schema.invitations.usesLeft, 0),
                        gt(schema.invitations.expiresAt, new Date()),
                      ),
                    )
                    .limit(1);

                  if (inv.length > 0) {
                    await db.insert(schema.allowedUsers).values({
                      discordId,
                      note: "Invitation",
                    });

                    await db
                      .update(schema.invitations)
                      .set({ usesLeft: inv[0]!.usesLeft - 1 })
                      .where(eq(schema.invitations.token, pendingToken));
                  }
                }
              }
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
