import Link from "next/link";
import { notFound } from "next/navigation";
import { gql } from "@apollo/client";
import { query } from "@/lib/apollo-client";
import { AddObservationForm } from "./AddObservationForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditGardenButton } from "@/components/GardenActions";
import {
  DeleteGardenButton, CreateBedButton,
  EditBedButton, DeleteBedButton,
} from "@/components/GardenDetailActions";
import {
  CreatePlantButton, EditPlantButton,
  DeletePlantButton, DeleteObservationButton,
} from "@/components/PlantActions";

const GARDEN_QUERY = gql`
  query Garden($id: ID!) {
    garden(id: $id) {
      id
      name
      location
      beds {
        id
        name
        sizeSqFt
        plants {
          id
          name
          species
          status
          observations {
            id
            note
            type
            createdAt
          }
          companion {
            fullName
            commonNames
            plantType
            light
            hardinessZone
            maintenance
            resistance
            tags
            companionSlugs
          }
        }
      }
    }
  }
`;

type GardenData = {
  garden: {
    id: string;
    name: string;
    location: string | null;
    beds: {
      id: string;
      name: string;
      sizeSqFt: number | null;
      plants: {
        id: string;
        name: string;
        species: string | null;
        status: string;
        observations: {
          id: string;
          note: string;
          type: string;
          createdAt: string;
        }[];
        companion: {
          fullName: string | null;
          commonNames: string[];
          plantType: string[];
          light: string[];
          hardinessZone: string[];
          maintenance: string[];
          resistance: string[];
          tags: string[];
          companionSlugs: string[];
        } | null;
      }[];
    }[];
  } | null;
};

export default async function GardenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data } = await query<GardenData>({
    query: GARDEN_QUERY,
    variables: { id },
  });

  if (!data?.garden) notFound();
  const garden = data.garden;

  return (
    <>
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← My gardens
      </Link>

      <div className="flex items-start justify-between gap-3 mt-2 mb-6">
        <div>
          <h1 className="text-3xl font-bold">{garden.name}</h1>
          {garden.location && (
            <p className="text-muted-foreground mt-0.5">{garden.location}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-1">
          <EditGardenButton id={garden.id} currentName={garden.name} currentLocation={garden.location} />
          <DeleteGardenButton id={garden.id} />
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Beds</h2>
        <CreateBedButton gardenId={garden.id} />
      </div>

      {garden.beds.length === 0 && (
        <p className="text-muted-foreground text-sm">No beds yet. Add one above.</p>
      )}

      {garden.beds.map((bed) => (
        <section key={bed.id} className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{bed.name}</h3>
              {bed.sizeSqFt && (
                <Badge variant="outline" className="text-xs">{bed.sizeSqFt} sq ft</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <CreatePlantButton bedId={bed.id} />
              <EditBedButton id={bed.id} currentName={bed.name} currentSize={bed.sizeSqFt} />
              <DeleteBedButton id={bed.id} />
            </div>
          </div>

          {bed.plants.length === 0 && (
            <p className="text-muted-foreground text-sm pl-1">No plants yet.</p>
          )}

          <div className="flex flex-col gap-4">
            {bed.plants.map((plant) => (
              <Card key={plant.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{plant.name}</CardTitle>
                      {plant.species && (
                        <p className="text-sm text-muted-foreground italic mt-0.5">
                          {plant.species}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="secondary" className="capitalize">
                        {plant.status.toLowerCase()}
                      </Badge>
                      <EditPlantButton
                        id={plant.id}
                        currentName={plant.name}
                        currentSpecies={plant.species}
                        currentStatus={plant.status}
                      />
                      <DeletePlantButton id={plant.id} />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {plant.companion && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {plant.companion.plantType.map((t) => (
                          <Badge key={t} variant="default" className="text-xs">{t}</Badge>
                        ))}
                        {plant.companion.light.map((l) => (
                          <Badge key={l} variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">{l}</Badge>
                        ))}
                        {plant.companion.hardinessZone.length > 0 && (
                          <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">
                            Zone {plant.companion.hardinessZone.join(", ")}
                          </Badge>
                        )}
                        {plant.companion.maintenance.map((m) => (
                          <Badge key={m} variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
                            {m} maintenance
                          </Badge>
                        ))}
                      </div>

                      {plant.companion.companionSlugs.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Pairs with: </span>
                          {plant.companion.companionSlugs.slice(0, 5).map((s) => s.replace(/-/g, " ")).join(", ")}
                          {plant.companion.companionSlugs.length > 5 && ` +${plant.companion.companionSlugs.length - 5} more`}
                        </p>
                      )}

                      {plant.companion.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {plant.companion.tags.slice(0, 8).map((t) => (
                            <span key={t} className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                              {t.replace(/^#/, "")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {plant.observations.length > 0 && (
                    <ul className="space-y-1 text-sm pl-0 list-none">
                      {plant.observations.map((o) => (
                        <li key={o.id} className="flex items-start gap-1.5">
                          <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                            {o.type.toLowerCase()}
                          </Badge>
                          <span className="flex-1">{o.note}</span>
                          <DeleteObservationButton id={o.id} />
                        </li>
                      ))}
                    </ul>
                  )}

                  <AddObservationForm plantId={plant.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
