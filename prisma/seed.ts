// Run with: npm run db:seed
// Standalone script, so it builds its own Prisma client + adapter
// rather than relying on the "@/" path alias.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean slate (order matters because of FKs, but cascade handles children).
  await prisma.gardener.deleteMany();

  const gardener = await prisma.gardener.create({
    data: { email: "you@example.com", name: "You" },
  });

  await prisma.garden.create({
    data: {
      name: "Backyard Plot",
      location: "South-facing raised beds",
      gardenerId: gardener.id,
      beds: {
        create: [
          {
            name: "Bed A — Tomatoes & Herbs",
            sizeSqFt: 16,
            plants: {
              create: [
                {
                  name: "Cherry Tomato",
                  species: "Solanum lycopersicum",
                  status: "FRUITING",
                  observations: {
                    create: [
                      { note: "First flowers appeared", type: "GENERAL" },
                      { note: "Deep watered, soil was dry", type: "WATERING" },
                    ],
                  },
                },
                { name: "Basil", species: "Ocimum basilicum", status: "FLOWERING" },
              ],
            },
          },
          {
            name: "Bed B — Greens",
            sizeSqFt: 12,
            plants: {
              create: [
                { name: "Kale", species: "Brassica oleracea", status: "PLANTED" },
                {
                  name: "Lettuce",
                  species: "Lactuca sativa",
                  status: "SPROUTING",
                  observations: {
                    create: [{ note: "Aphids spotted on undersides", type: "PEST" }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.garden.create({
    data: {
      name: "Balcony Containers",
      location: "Apartment balcony, morning sun",
      gardenerId: gardener.id,
      beds: {
        create: [
          {
            name: "Container Row",
            plants: {
              create: [
                { name: "Strawberry", species: "Fragaria × ananassa", status: "FRUITING" },
                { name: "Mint", species: "Mentha", status: "FLOWERING" },
              ],
            },
          },
        ],
      },
    },
  });

  console.log("✅ Seeded sample gardens.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
