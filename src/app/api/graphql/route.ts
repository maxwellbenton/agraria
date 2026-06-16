// The GraphQL endpoint lives at /api/graphql.
// @as-integrations/next bridges Apollo Server 5 to Next.js route handlers.
import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import type { NextRequest } from "next/server";

import { typeDefs } from "@/graphql/schema";
import { resolvers } from "@/graphql/resolvers";

const server = new ApolloServer({ typeDefs, resolvers });

const _handler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => ({ req }),
});

// Cast to satisfy Next.js 16's strict App Router route handler types.
// startServerAndCreateNextHandler returns an overloaded function that covers
// both Pages Router and App Router; Next.js 16 only accepts the App Router
// signature here.
const handler = _handler as (req: NextRequest) => Promise<Response>;

export { handler as GET, handler as POST };
