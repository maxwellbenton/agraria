// Apollo Client instance for React Server Components.
// `query` is a convenience shortcut; `getClient()` gives you the full client.
// During SSR the URI must be ABSOLUTE — relative URLs don't work server-side.
import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";

export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri:
        process.env.GRAPHQL_ENDPOINT ?? "http://127.0.0.1:3000/api/graphql",
    }),
  });
});
