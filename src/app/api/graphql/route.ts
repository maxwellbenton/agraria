// The GraphQL endpoint lives at /api/graphql.
// @as-integrations/next bridges Apollo Server 5 to Next.js route handlers.
import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import type { NextRequest } from "next/server";

import { typeDefs } from "@/graphql/schema";
import { resolvers } from "@/graphql/resolvers";
import { auth } from "@/auth";

const server = new ApolloServer({ typeDefs, resolvers });

const _handler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => {
    // auth() reads the session cookie — works in route handlers in next-auth v5.
    const session = await auth();
    return { req, gardenerId: session?.gardenerId };
  },
});

// Cast to satisfy Next.js 16's strict App Router route handler types.
const handler = _handler as (req: NextRequest) => Promise<Response>;

export { handler as GET, handler as POST };
