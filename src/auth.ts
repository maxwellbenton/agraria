/**
 * Auth.js v5 configuration.
 * Supports GitHub OAuth (required) and Google OAuth (optional — only enabled
 * if AUTH_GOOGLE_ID is present in env).
 *
 * On first sign-in the user's email is used to upsert a Gardener row,
 * and the resulting gardener ID is stored in the JWT so every server
 * component / resolver can scope data to the current user.
 *
 * Required env vars:
 *   AUTH_SECRET          — openssl rand -base64 32
 *   AUTH_GITHUB_ID       — GitHub OAuth app client ID
 *   AUTH_GITHUB_SECRET   — GitHub OAuth app client secret
 *
 * Optional:
 *   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET  — Google OAuth credentials
 */

import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

// Augment the built-in Session type to include gardenerId.
// next-auth/jwt is not a resolvable module in all setups, so we extend
// Session directly and carry gardenerId through the session callback.
declare module "next-auth" {
  interface Session extends DefaultSession {
    gardenerId?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Required for Vercel / behind-proxy deployments
  trustHost: true,

  providers: [
    GitHub,
    ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // `user` is only populated on the very first sign-in.
      // After that, gardenerId persists in the JWT across refreshes.
      if (user?.email) {
        const gardener = await prisma.gardener.upsert({
          where: { email: user.email },
          update: { name: user.name ?? token.name ?? "" },
          create: {
            email: user.email,
            name: user.name ?? user.email.split("@")[0],
          },
          select: { id: true },
        });
        token.gardenerId = gardener.id;
      }
      return token;
    },

    async session({ session, token }) {
      session.gardenerId = token.gardenerId as string | undefined;
      return session;
    },

    authorized({ auth: session }) {
      // Used by middleware to gate every non-API route.
      return !!session?.user;
    },
  },
});
