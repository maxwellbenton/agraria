import Link from "next/link";
import { notFound } from "next/navigation";
import { gql } from "@apollo/client";
import { query } from "@/lib/apollo-client";
import { PhotoScanFlow } from "./PhotoScanFlow";

const GARDEN_FOR_SCAN_QUERY = gql`
  query GardenForScan($id: ID!) {
    garden(id: $id) {
      id
      name
      beds {
        id
        name
      }
    }
  }
`;

type GardenForScanData = {
  garden: { id: string; name: string; beds: { id: string; name: string }[] } | null;
};

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data } = await query<GardenForScanData>({
    query: GARDEN_FOR_SCAN_QUERY,
    variables: { id },
  });

  if (!data?.garden) notFound();
  const garden = data.garden;

  return (
    <div className="max-w-3xl mx-auto py-6">
      <Link href={`/gardens/${id}`} className="text-sm text-muted-foreground hover:underline">
        ← {garden.name}
      </Link>

      <h1 className="text-2xl font-bold mt-2 mb-1">Scan a plant</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Take or upload a close-up photo of one plant. It shows up below as an editable
        suggestion — nothing is saved until you pick a bed and add it.
      </p>

      <PhotoScanFlow beds={garden.beds} />
    </div>
  );
}
