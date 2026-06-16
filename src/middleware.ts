import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

// Use only the edge-safe config (no Prisma) so the middleware
// can run in the Edge Runtime without Node.js module errors.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!login|api/auth|api/graphql|_next/static|_next/image|favicon.ico).*)",
  ],
};
