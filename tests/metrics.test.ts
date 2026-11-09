import { describe, expect, it } from "vitest";
import { haversineKm, insideCircle, circleRadiusKm, revealDistances } from "@/lib/metrics";

const suseo = { lat: 37.4874, lng: 127.1015 };
const iksan = { lat: 35.9407, lng: 126.9465 };

describe("metrics", () => {
  it("haversine Suseo→Iksan is ~172 km", () => {
    const d = haversineKm(suseo, iksan);
    expect(d).toBeGreaterThan(165);
    expect(d).toBeLessThan(180);
  });
  it("zero distance", () => expect(haversineKm(suseo, suseo)).toBe(0));
  it("circle inside/outside", () => {
    expect(insideCircle(suseo, 5, { lat: 37.5, lng: 127.1 })).toBe(true);
    expect(insideCircle(suseo, 5, iksan)).toBe(false);
  });
  it("radius = 3 km/h × hours, capped at 5", () => {
    expect(circleRadiusKm(1)).toBe(3);
    expect(circleRadiusKm(4)).toBe(5);
  });
  it("nearest candidate rank", () => {
    const r = revealDistances(iksan, [
      { rank: 1, name: "Suseo", geo: suseo },
      { rank: 2, name: "Iksan", geo: iksan },
    ]);
    expect(r.nearest_rank).toBe(2);
    expect(r.rows[1].distance_to_found_km).toBe(0);
  });
});
