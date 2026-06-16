// The GraphQL endpoint lives at /api/graphql.
//
// We implement the route handler directly (without startServerAndCreateNextHandler)
// so that auth() is called at the top of the route handler where Next.js's
// cookie/header context is guaranteed to be available.
import { ApolloServer, HeaderMap } from "@apollo/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

import { typeDefs } from "@/graphql/schema";
import { resolvers } from "@/graphql/resolvers";

const server = new ApolloServer({ typeDefs, resolvers });
server.startInBackgroundHandlingStartupErrorsByLoggingAndFailingAllRequests();

async function handler(req: NextRequest): Promise<Response> {
  // auth() is called here — at route handler scope — where Next.js async
  // context (cookies, headers) is always set up correctly.
  const session = await auth();
  const gardenerId = session?.gardenerId;

  // Forward all incoming headers to Apollo.
  const inHeaders = new HeaderMap();
  req.headers.forEach((value, key) => inHeaders.set(key, value));

  // Parse the request body (JSON for mutations/queries, text fallback).
  let body: unknown;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
    body = await req.text();
  }

  const httpResponse = await server.executeHTTPGraphQLRequest({
    httpGraphQLRequest: {
      method: req.method,
      headers: inHeaders,
      body,
      search: new URL(req.url).search,
    },
    context: async () => ({ gardenerId }),
  });

  const outHeaders = new Headers();
  for (const [key, value] of httpResponse.headers) {
    outHeaders.set(key, value);
  }

  let responseBody: string;
  if (httpResponse.body.kind === "complete") {
    responseBody = httpResponse.body.string;
  } else {
    const chunks: string[] = [];
    for await (const chunk of httpResponse.body.asyncIterator) {
      chunks.push(chunk);
    }
    responseBody = chunks.join("");
  }

  return new Response(responseBody, {
    status: httpResponse.status ?? 200,
    headers: outHeaders,
  });
}

export { handler as GET, handler as POST };
