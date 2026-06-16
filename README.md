# 🌱 Agraria

A small gardening app. Track gardens → beds → plants → observations. Built using **Next.js** and **GraphQL**.

## Stack

- **Next.js 16** — App Router, React Server Components, Turbopack
- **Apollo Server 5** — GraphQL API, mounted as a Next.js route handler at `/api/graphql`
- **Apollo Client 4** — `@apollo/client-integration-nextjs` for server + client components
- **Prisma 7** — ORM with a Postgres driver adapter
- **PostgreSQL** — free tier on [Neon](https://neon.tech) or [Supabase](https://supabase.com)

## Setup

### 1. Install dependencies

```bash
npm install
```

If `npm install` ever complains about peer dependencies, the integration packages
move fast — reinstall the two that are pinned to `latest` explicitly:

```bash
npm install @apollo/client-integration-nextjs@latest @as-integrations/next@latest
```

### 2. Create a database

Make a free Postgres database (Neon or Supabase). Copy the connection string.

```bash
cp .env.example .env
# then edit .env and paste your DATABASE_URL
```

### 3. Create the schema + sample data

```bash
npm run db:migrate     # creates tables (name the migration e.g. "init")
npm run db:generate    # generates the Prisma client into src/generated/prisma
npm run db:seed        # inserts two sample gardens
```

### 4. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. The GraphQL endpoint is at
<http://localhost:3000/api/graphql> — open it in the browser to use Apollo's
sandbox and explore the schema.

## How the pieces fit

```
Browser ──┬─ Server Component (page.tsx)      ─┐
          │     uses query() from              │
          │     lib/apollo-client.ts           │
          │                                    ├─► /api/graphql (Apollo Server)
          └─ Client Component (form)            │        │
                uses useMutation hook          ─┘        ├─► resolvers.ts
                                                         └─► Prisma ─► Postgres
```

- **Reads** happen in Server Components (`page.tsx`, `gardens/[id]/page.tsx`) via the
  server-side Apollo `query()` helper — no client JS, no loading spinner.
- **Writes** happen in a Client Component (`AddObservationForm.tsx`) via `useMutation`,
  then `router.refresh()` re-renders the server component with fresh data.
- **Resolvers** (`src/graphql/resolvers.ts`) are where to spend your attention. The
  field-level resolvers (`Garden.beds`, `Bed.plants`, …) only run when the client asks
  for those fields — that's the whole point of GraphQL.

## Deploying to Vercel (free)

1. Push to GitHub, import the repo at [vercel.com](https://vercel.com).
2. Add env vars in the Vercel project settings:
   - `DATABASE_URL` — your Postgres string
   - `GRAPHQL_ENDPOINT` — `https://<your-app>.vercel.app/api/graphql`
3. Deploy. The `build` script runs `prisma generate` automatically.

## Suggested learning path / stretch goals

Once the basics click, these each teach something concrete and look good on a portfolio:

1. **Auth** — add real gardeners with `next-auth` / Auth.js, scope queries to the logged-in user.
2. **DataLoader** — the naive resolvers cause N+1 queries on nested lists. Batch them.
3. **Optimistic UI** — make the observation form update instantly via Apollo's optimistic response + cache update instead of `router.refresh()`.
4. **Mobile capture** — a quick "log observation" route that works well one-handed in the garden (this is the "update on phone, review on laptop" flow — it's just responsive design, no special backend).
5. **Photos** — attach images to observations (Vercel Blob or Supabase Storage, both have free tiers).
6. **Subscriptions** — real-time updates with GraphQL subscriptions (more advanced).

## File map

```
prisma/
  schema.prisma          data model (Gardener → Garden → Bed → Plant → Observation)
  seed.ts                sample data
prisma.config.ts         Prisma 7 CLI config
src/
  lib/
    prisma.ts            Prisma client + Postgres adapter (singleton)
    apollo-client.ts     server-side Apollo Client (for Server Components)
  graphql/
    schema.ts            GraphQL type definitions (SDL)
    resolvers.ts         resolvers backed by Prisma  ← the interesting part
  app/
    api/graphql/route.ts Apollo Server as a Next route handler
    ApolloWrapper.tsx    client-side Apollo provider
    layout.tsx           root layout
    page.tsx             gardens list (Server Component)
    gardens/[id]/
      page.tsx           garden detail, one nested query
      AddObservationForm.tsx   client mutation form
```