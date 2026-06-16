import { prisma } from "@/lib/prisma";
import { getCompanionPlant, toCompanionSlug } from "@/lib/plant-companion";

// A few notes for learning:
// - Top-level resolvers (Query/Mutation) are the entry points.
// - The per-type resolvers below (Garden.beds, Bed.plants, etc.) only run when
//   the client actually asks for those fields. That's the core idea of GraphQL:
//   the client picks the shape, and each field is resolved on demand.
// - This naive version can cause "N+1" queries on deeply nested lists. Once the
//   basics click, swapping these for DataLoader is a great next exercise.

type IdArg = { id: string };

export const resolvers = {
  Query: {
    gardens: () => prisma.garden.findMany({ orderBy: { createdAt: "desc" } }),
    garden: (_p: unknown, { id }: IdArg) =>
      prisma.garden.findUnique({ where: { id } }),
    plant: (_p: unknown, { id }: IdArg) =>
      prisma.plant.findUnique({ where: { id } }),
  },

  Mutation: {
    createGarden: (
      _p: unknown,
      { input }: { input: { name: string; location?: string; gardenerId: string } }
    ) =>
      prisma.garden.create({
        data: {
          name: input.name,
          location: input.location,
          gardener: { connect: { id: input.gardenerId } },
        },
      }),

    createBed: (
      _p: unknown,
      { input }: { input: { name: string; sizeSqFt?: number; gardenId: string } }
    ) =>
      prisma.bed.create({
        data: {
          name: input.name,
          sizeSqFt: input.sizeSqFt,
          garden: { connect: { id: input.gardenId } },
        },
      }),

    createPlant: (
      _p: unknown,
      { input }: { input: { name: string; species?: string; bedId: string } }
    ) =>
      prisma.plant.create({
        data: {
          name: input.name,
          species: input.species,
          bed: { connect: { id: input.bedId } },
        },
      }),

    addObservation: (
      _p: unknown,
      {
        input,
      }: {
        input: { plantId: string; note: string; type?: string; heightCm?: number };
      }
    ) =>
      prisma.observation.create({
        data: {
          note: input.note,
          type: (input.type as never) ?? "GENERAL",
          heightCm: input.heightCm,
          plant: { connect: { id: input.plantId } },
        },
      }),

    updatePlantStatus: (
      _p: unknown,
      { id, status }: { id: string; status: string }
    ) => prisma.plant.update({ where: { id }, data: { status: status as never } }),
  },

  // Field-level resolvers for relations.
  Garden: {
    beds: (parent: { id: string }) =>
      prisma.bed.findMany({ where: { gardenId: parent.id } }),
    gardener: (parent: { gardenerId: string }) =>
      prisma.gardener.findUnique({ where: { id: parent.gardenerId } }),
  },
  Bed: {
    plants: (parent: { id: string }) =>
      prisma.plant.findMany({ where: { bedId: parent.id } }),
  },
  Plant: {
    observations: (parent: { id: string }) =>
      prisma.observation.findMany({
        where: { plantId: parent.id },
        orderBy: { createdAt: "desc" },
      }),
    // Looks up the plant in the An Incomplete Gardening Companion dataset by
    // converting the species field to a slug. Returns null on no match.
    companion: (parent: { species: string | null }) => {
      const slug = toCompanionSlug(parent.species);
      if (!slug) return null;
      return getCompanionPlant(slug);
    },
  },
  Gardener: {
    gardens: (parent: { id: string }) =>
      prisma.garden.findMany({ where: { gardenerId: parent.id } }),
  },
};
