/**
 * Edge-safe Auth.js config — no Node.js / Prisma imports.
 * Used by middleware (Edge Runtime) and re-exported by auth.ts
 * (Node.js runtime, where Prisma callbacks are added on top).
 */
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    GitHub,
    ...(process.env.AUTH_GOOGLE_ID ? [Google] : []),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
