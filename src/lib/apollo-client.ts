// Apollo Client instance for React Server Components.
// `query` is a convenience shortcut; `getClient()` gives you the full client.
// During SSR the URI must be ABSOLUTE — relative URLs don't work server-side.
//
// Resolution order:
//   1. GRAPHQL_ENDPOINT  — set this to lock in a specific URL
//   2. VERCEL_URL        — automatically set by Vercel on every deployment
//   3. 127.0.0.1:3000    — local dev fallback
import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";

function graphqlEndpoint(): string {
  if (process.env.GRAPHQL_ENDPOINT) return process.env.GRAPHQL_ENDPOINT;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}/api/graphql`;
  return "http://127.0.0.1:3000/api/graphql";
}

export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: graphqlEndpoint() }),
  });
});
