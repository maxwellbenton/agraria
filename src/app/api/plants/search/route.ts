import { type NextRequest } from "next/server";
import { searchPlants } from "@/lib/plant-companion";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json([]);
  try {
    const results = await searchPlants(q, 8);
    return Response.json(results);
  } catch {
    return Response.json([]);
  }
}
