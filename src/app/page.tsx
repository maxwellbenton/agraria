import Link from "next/link";
import { gql } from "@apollo/client";
import { query } from "@/lib/apollo-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateGardenButton, EditGardenButton } from "@/components/GardenActions";
import { DeleteGardenButton } from "@/components/GardenDetailActions";

export const dynamic = "force-dynamic";

const GARDENS_QUERY = gql`
  query Gardens {
    gardens {
      id
      name
      location
      beds { id }
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
      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h1 className="text-3xl font-bold">My Gardens</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {gardens.length === 0 ? "No gardens yet." : `${gardens.length} garden${gardens.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <CreateGardenButton />
      </div>

      <div className="flex flex-col gap-3">
        {gardens.map((g) => (
          <Card key={g.id} className="hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-3 p-5">
              <Link href={`/gardens/${g.id}`} className="flex-1 min-w-0 no-underline hover:no-underline">
                <p className="font-semibold text-base">{g.name}</p>
                {g.location && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{g.location}</p>
                )}
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="secondary">{g.beds.length} beds</Badge>
                <EditGardenButton id={g.id} currentName={g.name} currentLocation={g.location} />
                <DeleteGardenButton id={g.id} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

