// The GraphQL endpoint lives at /api/graphql.
// @as-integrations/next bridges Apollo Server 5 to Next.js route handlers.
import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { typeDefs } from "@/graphql/schema";
import { resolvers } from "@/graphql/resolvers";

const server = new ApolloServer({ typeDefs, resolvers });

const _handler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => {
    // getToken reads the JWT directly from the request cookies — more reliable
    // than auth() inside a third-party handler wrapper.
    const token = await getToken({ req, secret: process.env.AUTH_SECRET });
    return { req, gardenerId: token?.gardenerId as string | undefined };
  },
});

// Cast to satisfy Next.js 16's strict App Router route handler types.
const handler = _handler as (req: NextRequest) => Promise<Response>;

export { handler as GET, handler as POST };
