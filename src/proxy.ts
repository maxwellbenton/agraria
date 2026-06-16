import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Use only the edge-safe config (no Prisma) so the proxy
// can run in the Edge Runtime without Node.js module errors.
const { auth } = NextAuth(authConfig);

export function proxy(req: NextRequest) {
  return auth((authReq) => {
    if (!authReq.auth) {
      const loginUrl = new URL("/login", authReq.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  })(req, {} as never);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/graphql|_next/static|_next/image|favicon.ico).*)",
  ],
};
