import NextAuth, { type DefaultSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Augment the built-in Session type to include gardenerId.
declare module "next-auth" {
  interface Session extends DefaultSession {
    gardenerId?: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,

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
  },
});
