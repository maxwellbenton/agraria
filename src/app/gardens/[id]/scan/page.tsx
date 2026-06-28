import Link from "next/link";
import { notFound } from "next/navigation";
import { gql } from "@apollo/client";
import { query } from "@/lib/apollo-client";
import { PhotoScanFlow } from "./PhotoScanFlow";

const GARDEN_NAME_QUERY = gql`
  query GardenName($id: ID!) {
    garden(id: $id) {
      id
      name
    }
  }
`;

type GardenNameData = {
  garden: { id: string; name: string } | null;
};

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data } = await query<GardenNameData>({
    query: GARDEN_NAME_QUERY,
    variables: { id },
  });

  if (!data?.garden) notFound();

  return (
    <div className="max-w-3xl mx-auto py-6">
      <Link href={`/gardens/${id}`} className="text-sm text-muted-foreground hover:underline">
        ← {data.garden.name}
      </Link>

      <h1 className="text-2xl font-bold mt-2 mb-1">Scan a photo</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload or take a photo of a bed. Detected plants show up below as editable
        suggestions — nothing is saved until you create the bed and add each plant
        you want to keep.
      </p>

      <PhotoScanFlow gardenId={id} />
    </div>
  );
}
