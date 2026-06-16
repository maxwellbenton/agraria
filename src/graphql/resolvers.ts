import { prisma } from "@/lib/prisma";
import { getCompanionPlant, toCompanionSlug } from "@/lib/plant-companion";

// The GraphQL context carries the gardenerId from the authenticated session.
// Resolvers that modify data require a valid gardenerId.
type Context = { gardenerId?: string };
type IdArg = { id: string };

function requireAuth(ctx: Context): string {
  if (!ctx.gardenerId) throw new Error("Not authenticated");
  return ctx.gardenerId;
}

export const resolvers = {
  Query: {
    me: (_p: unknown, _a: unknown, ctx: Context) =>
      ctx.gardenerId
        ? prisma.gardener.findUnique({ where: { id: ctx.gardenerId } })
        : null,

    // Scoped to the authenticated gardener
    gardens: (_p: unknown, _a: unknown, ctx: Context) =>
      ctx.gardenerId
        ? prisma.garden.findMany({
            where: { gardenerId: ctx.gardenerId },
            orderBy: { createdAt: "desc" },
          })
        : [],

    garden: (_p: unknown, { id }: IdArg, ctx: Context) =>
      ctx.gardenerId
        ? prisma.garden.findFirst({ where: { id, gardenerId: ctx.gardenerId } })
        : null,

    plant: (_p: unknown, { id }: IdArg) =>
      prisma.plant.findUnique({ where: { id } }),
  },

  Mutation: {
    // ── Gardens ──────────────────────────────────────────────────────────────
    createGarden: (
      _p: unknown,
      { input }: { input: { name: string; location?: string } },
      ctx: Context
    ) => {
      const gardenerId = requireAuth(ctx);
      return prisma.garden.create({
        data: { name: input.name, location: input.location, gardenerId },
      });
    },

    updateGarden: (
      _p: unknown,
      { id, input }: { id: string; input: { name?: string; location?: string } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.garden.update({
        where: { id },
        data: { name: input.name ?? undefined, location: input.location ?? undefined },
      });
    },

    deleteGarden: async (_p: unknown, { id }: IdArg, ctx: Context) => {
      requireAuth(ctx);
      await prisma.garden.delete({ where: { id } });
      return true;
    },

    // ── Beds ─────────────────────────────────────────────────────────────────
    createBed: (
      _p: unknown,
      { input }: { input: { name: string; sizeSqFt?: number; gardenId: string } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.bed.create({
        data: {
          name: input.name,
          sizeSqFt: input.sizeSqFt,
          garden: { connect: { id: input.gardenId } },
        },
      });
    },

    updateBed: (
      _p: unknown,
      { id, input }: { id: string; input: { name?: string; sizeSqFt?: number } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.bed.update({
        where: { id },
        data: { name: input.name ?? undefined, sizeSqFt: input.sizeSqFt ?? undefined },
      });
    },

    deleteBed: async (_p: unknown, { id }: IdArg, ctx: Context) => {
      requireAuth(ctx);
      await prisma.bed.delete({ where: { id } });
      return true;
    },

    // ── Plants ────────────────────────────────────────────────────────────────
    createPlant: (
      _p: unknown,
      { input }: { input: { name: string; species?: string; bedId: string } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.plant.create({
        data: {
          name: input.name,
          species: input.species,
          bed: { connect: { id: input.bedId } },
        },
      });
    },

    updatePlant: (
      _p: unknown,
      { id, input }: { id: string; input: { name?: string; species?: string; status?: string } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.plant.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          species: input.species ?? undefined,
          status: (input.status as never) ?? undefined,
        },
      });
    },

    deletePlant: async (_p: unknown, { id }: IdArg, ctx: Context) => {
      requireAuth(ctx);
      await prisma.plant.delete({ where: { id } });
      return true;
    },

    // ── Observations ──────────────────────────────────────────────────────────
    addObservation: (
      _p: unknown,
      { input }: { input: { plantId: string; note: string; type?: string; heightCm?: number } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.observation.create({
        data: {
          note: input.note,
          type: (input.type as never) ?? "GENERAL",
          heightCm: input.heightCm,
          plant: { connect: { id: input.plantId } },
        },
      });
    },

    updateObservation: (
      _p: unknown,
      { id, input }: { id: string; input: { note?: string; type?: string; heightCm?: number } },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.observation.update({
        where: { id },
        data: {
          note: input.note ?? undefined,
          type: (input.type as never) ?? undefined,
          heightCm: input.heightCm ?? undefined,
        },
      });
    },

    deleteObservation: async (_p: unknown, { id }: IdArg, ctx: Context) => {
      requireAuth(ctx);
      await prisma.observation.delete({ where: { id } });
      return true;
    },

    updatePlantStatus: (
      _p: unknown,
      { id, status }: { id: string; status: string },
      ctx: Context
    ) => {
      requireAuth(ctx);
      return prisma.plant.update({ where: { id }, data: { status: status as never } });
    },
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
