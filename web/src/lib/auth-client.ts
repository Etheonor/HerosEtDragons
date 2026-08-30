import { createAuthClient } from "better-auth/client";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface Session {
  user: SessionUser;
}

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auth`
      : "http://localhost:8787/api/auth",
});

export const auth = {
  signInWithDiscord: async () => {
    await authClient.signIn.social({
      provider: "discord",
      callbackURL: "/",
    });
  },
  signOut: () => authClient.signOut(),
  getSession: async (): Promise<Session | null> => {
    const res = await authClient.getSession();
    if (res.error || !res.data) return null;
    return res.data as unknown as Session;
  },
};
