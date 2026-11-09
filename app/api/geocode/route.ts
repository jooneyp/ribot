import { LifeProfile } from "@/lib/contracts";
import { geocode } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { profile?: unknown };
    const profile = LifeProfile.parse(body.profile);
    const eras = await Promise.all(profile.eras.map(async (era) => ({
      ...era,
      places: await Promise.all(era.places.map(async (place) => ({ ...place, geo: await geocode(place.modern_query) }))),
    })));
    return Response.json({ ...profile, eras });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Geocoding failed" }, { status: 400 });
  }
}
