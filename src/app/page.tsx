import Link from "next/link";
import { gql } from "@apollo/client";
import { query } from "@/lib/apollo-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Force dynamic rendering so Next.js doesn't try to statically pre-render
// this page at build time (which would make an HTTP call to an API that
// doesn't exist yet during the Vercel build).
export const dynamic = "force-dynamic";

// This is a Server Component. The GraphQL query runs on the server at request
// time — no loading spinner needed, and no data-fetching code ships to the browser.
const GARDENS_QUERY = gql`
  query Gardens {
    gardens {
      id
      name
      location
      beds {
        id
      }
    }
  }
`;

type GardensData = {
  gardens: {
    id: string;
    name: string;
    location: string | null;
    beds: { id: string }[];
  }[];
};

export default async function Home() {
  const { data } = await query<GardensData>({ query: GARDENS_QUERY });
  const gardens = data?.gardens ?? [];

  return (
    <>
      <h1 className="text-3xl font-bold mb-1">🌱 Agraria</h1>
      <p className="text-muted-foreground mb-6">Keep track of your garden.</p>

      {gardens.length === 0 && (
        <p className="text-muted-foreground">
          No gardens yet. Run <code className="font-mono text-sm">npm run db:seed</code> to add sample data.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {gardens.map((g) => (
          <Link key={g.id} href={`/gardens/${g.id}`} className="block no-underline hover:no-underline">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-semibold text-base">{g.name}</p>
                  {g.location && (
                    <p className="text-sm text-muted-foreground mt-0.5">{g.location}</p>
                  )}
                </div>
                <Badge variant="secondary">{g.beds.length} beds</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
