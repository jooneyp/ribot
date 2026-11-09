"use client";

import "leaflet/dist/leaflet.css";

import L, { type LatLngBoundsExpression, type LatLngExpression, type LatLngTuple } from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

import type { EraImagery, Hazard, LatLng, MapViewProps } from "@/lib/contracts";
import { haversineKm } from "@/lib/metrics";

const KOREA_BOUNDS: LatLngBoundsExpression = [[33, 125], [38.6, 129.8]];
const ERA_COLORS = ["#b45309", "#0f766e", "#4f46e5", "#be123c", "#0369a1", "#7e22ce"];
const yearRange = (start: number | null | undefined, end: number | null | undefined) => {
  if (start != null && end != null) return `${start}–${end}`;
  if (start != null) return `${start}–now`;
  if (end != null) return `until ${end}`;
  return null;
};
type PinKind = "candidate" | "home" | "hub" | "place" | "found";

function pinIcon({ kind, label, color, badge, muted = false, present = false }: {
  kind: PinKind; label: string; color?: string; badge?: boolean; muted?: boolean; present?: boolean;
}) {
  const symbol = kind === "home" ? "⌂" : kind === "hub" ? "🚆" : kind === "found" ? "★" : label;
  const size = present ? 50 : 44;
  const iconWidth = badge ? 88 : size;
  return L.divIcon({
    className: `ribot-pin-wrap${muted ? " is-muted" : ""}${kind === "found" ? " is-found" : ""}${badge ? " has-imagery" : ""}`,
    html: `<div class="ribot-pin ribot-pin--${kind}" style="--pin-color:${color ?? "#20201e"};--pin-size:${size}px"><span>${symbol}</span></div>${badge ? '<span class="ribot-imagery-badge">Then/Now</span>' : ""}`,
    iconSize: [iconWidth, size + (badge ? 18 : 0)], iconAnchor: [iconWidth / 2, size], tooltipAnchor: [0, -size + 4],
  });
}

function hazardIcon(kind: Hazard["kind"], present: boolean) {
  const size = present ? 46 : 40;
  return L.divIcon({
    className: `ribot-hazard-wrap ribot-hazard-wrap--${kind}`,
    html: kind === "water"
      ? '<div class="ribot-hazard ribot-hazard--water" aria-hidden="true">●</div>'
      : '<div class="ribot-hazard ribot-hazard--hill" aria-hidden="true">▲</div>',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2 + 4, 0],
  });
}

function imageryFor(point: LatLng, imagery: EraImagery[] | undefined) {
  let nearest: { item: EraImagery; distance: number } | null = null;
  for (const item of imagery ?? []) {
    if (!item.center) continue;
    const distance = haversineKm(point, item.center);
    if (distance <= 3 && (!nearest || distance < nearest.distance)) nearest = { item, distance };
  }
  return nearest?.item ?? null;
}

function eraOverlapsDecade(start: number | null, end: number | null, decade: number | null | undefined) {
  if (decade == null || start == null || end == null) return true;
  return start <= decade + 9 && end >= decade;
}

function FitBounds({ points, maxZoom = 13, compact = false, enabled = true }: { points: LatLngExpression[]; maxZoom?: number; compact?: boolean; enabled?: boolean }) {
  const map = useMap();
  const signature = JSON.stringify({ points, maxZoom, compact });
  useEffect(() => {
    if (!enabled || !points.length) return;
    map.invalidateSize();
    if (points.length === 1) map.flyTo(points[0], 12, { duration: 0.85 });
    else map.flyToBounds(L.latLngBounds(points), {
      paddingTopLeft: compact ? [100, 80] : [170, 110],
      paddingBottomRight: compact ? [100, 80] : [220, 130],
      maxZoom,
      duration: 1.15,
    });
    // Coordinates are serialized so equivalent arrays do not retrigger the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, map, signature]);
  return null;
}

function ZoomTiles() {
  const map = useMap();
  const [satellite, setSatellite] = useState(map.getZoom() >= 16);
  useMapEvents({
    zoom: () => setSatellite(map.getZoom() >= 16),
    zoomend: () => setSatellite(map.getZoom() >= 16),
  });
  return <>
    <TileLayer opacity={satellite ? 0 : 1} attribution="Esri, HERE, Garmin, &copy; OpenStreetMap contributors" url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={16} maxZoom={19} />
    <TileLayer opacity={satellite ? 0 : 1} url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={16} maxZoom={19} />
    <Pane name="satellite-tiles" className="ribot-satellite-pane" style={{ zIndex: 201 }}>
      <TileLayer
        pane="satellite-tiles"
        opacity={satellite ? 1 : 0}
        attribution="Esri, Maxar, Earthstar Geographics"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={19}
        maxZoom={19}
      />
    </Pane>
  </>;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/** Resolve once every visible tile in the map has finished loading (max `limit` ms), so camera moves never show gray gaps. */
async function tilesLoaded(map: L.Map, limit = 3500) {
  const start = Date.now();
  while (Date.now() - start < limit) {
    const pending = map.getContainer().querySelectorAll(".leaflet-tile-container img.leaflet-tile:not(.leaflet-tile-loaded)").length;
    if (pending === 0) return;
    await wait(120);
  }
}

function CameraTour({ enabled, points, lastSeen, routes }: {
  enabled: boolean;
  points: LatLngExpression[];
  lastSeen: LatLngExpression | null;
  routes: NonNullable<MapViewProps["routes"]> | null;
}) {
  const map = useMap();
  const ran = useRef(false);
  useEffect(() => {
    if (!enabled || ran.current || !lastSeen || !routes?.routes[0]?.reach.walked.length || !points.length) return;
    ran.current = true;
    let cancelled = false;
    const route = routes.routes[0];
    const overview = L.latLngBounds(points);
    const walked = route.reach.walked;
    const follow = Array.from({ length: 4 }, (_, index) => walked[Math.min(walked.length - 1, Math.round((walked.length - 1) * (index + 1) / 4))]);
    (window as typeof window & { __ribotTourDone?: boolean }).__ribotTourDone = false;
    void (async () => {
      map.flyToBounds(overview, { padding: [100, 100], maxZoom: 13, duration: 2 });
      await wait(2000); await tilesLoaded(map);
      if (cancelled) return;
      map.flyTo(lastSeen, 17, { duration: 2 });
      await wait(2000); await tilesLoaded(map);
      // Follow the walked line at a fixed zoom: panning keeps lines crisp (zooming rescales them mid-flight).
      for (const point of follow) {
        if (cancelled) return;
        map.panTo(point, { animate: true, duration: 1.2, easeLinearity: 1 });
        await wait(1200); await tilesLoaded(map, 1500);
      }
      if (cancelled) return;
      map.flyTo([route.reach.point.lat, route.reach.point.lng], 18, { duration: 2 });
      await wait(2000); await tilesLoaded(map);
      await wait(1200);
      if (cancelled) return;
      map.flyToBounds(overview, { padding: [100, 100], maxZoom: 13, duration: 2 });
      await wait(2000); await tilesLoaded(map);
      if (!cancelled) (window as typeof window & { __ribotTourDone?: boolean }).__ribotTourDone = true;
    })();
    return () => { cancelled = true; };
  }, [enabled, lastSeen, map, points, routes]);
  return null;
}

function LabelCollisionManager({ layoutKey, onChange }: { layoutKey: string; onChange: (ids: string[]) => void }) {
  const map = useMap();
  useEffect(() => {
    let frames: number[] = [];
    let pass = 0;
    const measure = () => {
      const labels = [...map.getContainer().querySelectorAll<HTMLElement>(".ribot-priority-label")]
        .map((element) => ({
          element,
          id: [...element.classList].find((name) => name.startsWith("ribot-label-id-"))?.slice(15) ?? "",
          priority: Number([...element.classList].find((name) => name.startsWith("ribot-label-priority-"))?.slice(21) ?? 0),
          order: Number([...element.classList].find((name) => name.startsWith("ribot-label-order-"))?.slice(18) ?? 0),
          rect: element.getBoundingClientRect(),
        }))
        .filter((label) => label.id)
        .toSorted((a, b) => b.priority - a.priority || a.order - b.order);
      const kept: typeof labels = [];
      const hidden: string[] = [];
      for (const label of labels) {
        const intersects = kept.some(({ rect }) =>
          label.rect.left < rect.right && label.rect.right > rect.left
          && label.rect.top < rect.bottom && label.rect.bottom > rect.top);
        if (intersects) hidden.push(label.id);
        else kept.push(label);
      }
      onChange(hidden);
      if (pass < 4) {
        pass += 1;
        frames.push(requestAnimationFrame(() => frames.push(requestAnimationFrame(measure))));
      }
    };
    const schedule = () => {
      frames.forEach(cancelAnimationFrame);
      pass = 0;
      frames = [requestAnimationFrame(() => {
        frames.push(requestAnimationFrame(measure));
      })];
    };
    map.on("moveend zoomend resize", schedule);
    schedule();
    return () => {
      frames.forEach(cancelAnimationFrame);
      map.off("moveend zoomend resize", schedule);
    };
  }, [layoutKey, map, onChange]);
  return null;
}

function clueIcon(rank: number, present: boolean) {
  const size = present ? 38 : 32;
  return L.divIcon({
    className: "ribot-clue-wrap",
    html: `<div class="ribot-clue-pin" style="--clue-size:${size}px"><span>${rank}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2 + 3, 0],
  });
}

function cctvIcon() {
  return L.divIcon({
    className: "ribot-cctv-wrap",
    html: '<div class="ribot-cctv" aria-hidden="true">▰</div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    tooltipAnchor: [9, 0],
  });
}

function ClueRadius({ center, radiusKm }: { center: LatLng; radiusKm: number }) {
  const latitudeRadius = radiusKm / 111.32;
  return <>
    <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#c084fc", fillColor: "#8b5cf6", fillOpacity: 0.06, opacity: 1, weight: 2 }} interactive={false} />
    <CircleMarker center={[center.lat - latitudeRadius, center.lng]} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }} interactive={false}>
      <Tooltip permanent direction="bottom" offset={[0, 12]} className="ribot-clue-radius-label">cell tower radius · {distanceLabel(radiusKm)}</Tooltip>
    </CircleMarker>
  </>;
}

function RadiusCircle({ center, radiusKm, label, secondary = false, hidden = false }: { center: LatLng; radiusKm: number; label: string; secondary?: boolean; hidden?: boolean }) {
  const style = secondary
    ? { color: "#d9ff62", fillColor: "transparent", fillOpacity: 0, opacity: 0.95, weight: 3, dashArray: "7 9" }
    : { color: "#e2e3de", fillColor: "#a8aaa4", fillOpacity: 0.38, opacity: 1, weight: 5 };
  const latitudeRadius = radiusKm / 111.32;
  const labelLatitude = center.lat + (secondary ? -latitudeRadius : latitudeRadius);
  return <>
    <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={style} interactive={false} />
    <CircleMarker center={[labelLatitude, center.lng]} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }} interactive={false}>
      <Tooltip key={String(hidden)} permanent direction={secondary ? "bottom" : "top"} offset={[0, secondary ? 42 : -8]} className={`ribot-circle-label ribot-priority-label ribot-label-id-ring-${secondary ? "secondary" : "primary"} ribot-label-priority-${secondary ? 55 : 90} ribot-label-order-${secondary ? 1 : 0}${secondary ? " ribot-hazard-ring-label" : ""}${hidden ? " is-collision-hidden" : ""}`}>{label} · {distanceLabel(radiusKm)}</Tooltip>
    </CircleMarker>
  </>;
}

const distanceLabel = (distance: number) => `${distance.toFixed(1)} km`;
const evenlySample = <T,>(items: T[], limit: number) => items.length <= limit
  ? items
  : Array.from({ length: limit }, (_, index) => items[Math.round(index * (items.length - 1) / (limit - 1))]);

export default function MapView({ plan, profile, decade, reveal, imagery, onSelectImagery, present = false, clues, routes, tour = false }: MapViewProps) {
  const [collisionState, setCollisionState] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const profilePlaces = useMemo(() => (profile?.eras ?? []).flatMap((era, eraIndex) =>
    era.places.filter((place) => place.geo).map((place) => ({
      era, eraIndex, place, geo: place.geo!, visible: eraOverlapsDecade(era.start_year, era.end_year, decade),
    }))), [profile, decade]);

  const nearestCandidate = reveal?.found.geo ? plan?.candidates.reduce<(typeof plan.candidates)[number] | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    return haversineKm(reveal.found.geo, candidate.geo) < haversineKm(reveal.found.geo, nearest.geo) ? candidate : nearest;
  }, null) : null;

  const nearCandidates = useMemo(
    () => plan?.candidates.filter((candidate) => candidate.distance_km_from_last_seen <= 50) ?? [],
    [plan],
  );
  const usesNearCandidateView = nearCandidates.length >= 2;
  const outsideCandidates = usesNearCandidateView
    ? plan?.candidates.filter((candidate) => candidate.distance_km_from_last_seen > 50) ?? []
    : [];

  const bounds = useMemo<LatLngExpression[]>(() => {
    const points: LatLngExpression[] = [];
    if (clues) {
      const latitudeRadius = clues.radius_km / 111.32;
      const longitudeRadius = latitudeRadius / Math.max(0.1, Math.cos(clues.center.lat * Math.PI / 180));
      points.push(
        [clues.center.lat + latitudeRadius, clues.center.lng + longitudeRadius],
        [clues.center.lat - latitudeRadius, clues.center.lng - longitudeRadius],
      );
    } else if (plan) {
      points.push([plan.last_seen.geo.lat, plan.last_seen.geo.lng]);
      points.push(...(usesNearCandidateView ? nearCandidates : plan.candidates).map((candidate) => [candidate.geo.lat, candidate.geo.lng] as LatLngTuple));
      if (!usesNearCandidateView) {
        points.push(...plan.send_first.filter((hub) => hub.geo).map((hub) => [hub.geo!.lat, hub.geo!.lng] as LatLngTuple));
      }
      points.push(...(plan.hazards ?? []).map((hazard) => [hazard.geo.lat, hazard.geo.lng] as LatLngTuple));
      // Candidate-less plans focus the camera on the actionable 75% search ring,
      // while plans with destinations retain the wider 95% overview.
      const fitRadiusKm = usesNearCandidateView && plan.hazard_ring_km
        ? plan.hazard_ring_km
        : plan.candidates.length === 0 && plan.hazard_ring_km
        ? plan.hazard_ring_km
        : plan.circle.radius_km;
      const latitudeRadius = fitRadiusKm / 111.32;
      const longitudeRadius = latitudeRadius / Math.max(0.1, Math.cos(plan.circle.center.lat * Math.PI / 180));
      points.push(
        [plan.circle.center.lat + latitudeRadius, plan.circle.center.lng + longitudeRadius],
        [plan.circle.center.lat - latitudeRadius, plan.circle.center.lng - longitudeRadius],
      );
    } else points.push(...profilePlaces.map(({ geo }) => [geo.lat, geo.lng] as LatLngTuple));
    if (!clues && reveal) points.push([reveal.found.geo.lat, reveal.found.geo.lng]);
    return points;
  }, [clues, nearCandidates, plan, profilePlaces, reveal, usesNearCandidateView]);

  const topCandidate = plan?.candidates.find((candidate) => candidate.rank === 1);
  const route = plan && topCandidate ? [[plan.last_seen.geo.lat, plan.last_seen.geo.lng], [topCandidate.geo.lat, topCandidate.geo.lng]] as LatLngTuple[] : null;
  const routeDistance = plan && topCandidate ? haversineKm(plan.last_seen.geo, topCandidate.geo) : null;
  const nearestDistance = reveal && nearestCandidate ? haversineKm(reveal.found.geo, nearestCandidate.geo) : null;

  const hubs = plan?.send_first.filter((hub) => hub.geo) ?? [];
  const candidates = plan?.candidates ?? [];
  const hazards = plan?.hazards ?? [];
  const eras = profile?.eras ?? [];
  const imageryBadgeCandidateId = candidates.reduce<{ id: string; distance: number; rank: number } | null>((best, candidate) => {
    for (const item of imagery ?? []) {
      if (!item.center) continue;
      const distance = haversineKm(candidate.geo, item.center);
      if (distance > 3) continue;
      if (!best || distance < best.distance || (distance === best.distance && candidate.rank < best.rank)) {
        best = { id: candidate.place_id, distance, rank: candidate.rank };
      }
    }
    return best;
  }, null)?.id ?? null;
  const labelCandidates = [
    ...candidates.filter((candidate) => candidate.layer === "past").toSorted((a, b) => a.rank - b.rank).slice(0, 3),
    ...candidates.filter((candidate) => candidate.layer === "routine").toSorted((a, b) => a.rank - b.rank).slice(0, 2),
  ];
  const permanentCandidates = labelCandidates.reduce<typeof candidates>((selected, candidate) => {
    // Keep the last-seen banner legible and avoid two permanent labels at effectively
    // the same map point. The de-duplicated pins still reveal their labels on hover.
    if (plan && haversineKm(plan.last_seen.geo, candidate.geo) < 2.5) return selected;
    if (selected.some((other) => haversineKm(other.geo, candidate.geo) < 1)) return selected;
    return [...selected, candidate];
  }, []);
  const permanentCandidateIds = new Set(permanentCandidates.map((candidate) => candidate.place_id));
  const labelLayoutKey = JSON.stringify({
    lastSeen: plan?.last_seen.geo,
    candidates: permanentCandidates.map((candidate) => [candidate.rank, candidate.geo]),
    hazards: hazards.slice(0, 3).map((hazard) => hazard.geo),
    rings: plan ? [plan.circle.radius_km, plan.hazard_ring_km] : null,
    routes: routes?.routes.map((walkingRoute) => [walkingRoute.to_place_id, walkingRoute.reach.point, walkingRoute.reach.hours]),
    reveal: reveal?.found.geo,
    present,
  });
  const suppressedLabels = collisionState.key === labelLayoutKey ? collisionState.ids : new Set<string>();
  const updateSuppressedLabels = useCallback((ids: string[]) => {
    setCollisionState((current) => {
      const next = new Set(ids);
      if (current.key === labelLayoutKey && current.ids.size === next.size && [...next].every((id) => current.ids.has(id))) return current;
      return { key: labelLayoutKey, ids: next };
    });
  }, [labelLayoutKey]);

  return (
    <div className={`ribot-map ${present ? "is-present" : ""}`}>
      <MapContainer bounds={KOREA_BOUNDS} boundsOptions={{ padding: [28, 28] }} maxZoom={19} zoomControl={!present} attributionControl={false} className="h-full w-full">
        <ZoomTiles />
        <FitBounds points={bounds} maxZoom={clues ? 15 : 13} compact={!!clues} enabled={!tour || !routes} />
        <CameraTour enabled={tour} points={bounds} lastSeen={plan?.last_seen.geo ?? null} routes={routes ?? null} />
        {!clues && plan && <LabelCollisionManager key={labelLayoutKey} layoutKey={labelLayoutKey} onChange={updateSuppressedLabels} />}
        {clues && <ClueRadius center={clues.center} radiusKm={clues.radius_km} />}
        {clues?.spots.map((spot, index) => <Marker key={`clue-${index}-${spot.name}`} position={[spot.geo.lat, spot.geo.lng]} icon={clueIcon(index + 1, present)} zIndexOffset={600 - index}><Tooltip permanent={index < 3} direction={index % 2 === 0 ? "right" : "left"} className="ribot-clue-label"><strong>#{index + 1} {spot.name}</strong></Tooltip></Marker>)}
        {!clues && plan && <RadiusCircle center={plan.circle.center} radiusKm={plan.circle.radius_km} label={plan.hazard_ring_km ? "95% ring" : plan.circle.label} hidden={suppressedLabels.has("ring-primary")} />}
        {!clues && plan?.hazard_ring_km && <RadiusCircle center={plan.circle.center} radiusKm={plan.hazard_ring_km} label="75% ring" secondary hidden={suppressedLabels.has("ring-secondary")} />}
        {!clues && !routes && route && routeDistance != null && routeDistance >= 0.25 && <Polyline positions={route} pathOptions={{ color: "#f0f1eb", dashArray: "10 12", opacity: 0.9, weight: present ? 4 : 3 }}><Tooltip key={String(suppressedLabels.has("route-distance"))} permanent direction="center" className={`ribot-distance-label ribot-priority-label ribot-label-id-route-distance ribot-label-priority-45 ribot-label-order-0${suppressedLabels.has("route-distance") ? " is-collision-hidden" : ""}`}>{distanceLabel(routeDistance)}</Tooltip></Polyline>}
        {!clues && routes?.routes.map((walkingRoute) => {
          const color = walkingRoute.layer === "routine" ? "#28c7b7" : walkingRoute.layer === "past" ? "#ff7058" : "#a8aaa4";
          return <Polyline key={`route-${walkingRoute.layer}-${walkingRoute.to_place_id}`} positions={walkingRoute.coords} pathOptions={{ color, opacity: 0.72, weight: 3 }}><Tooltip sticky>{walkingRoute.to_name} · {distanceLabel(walkingRoute.distance_km)}</Tooltip></Polyline>;
        })}
        {!clues && routes?.routes.map((walkingRoute) => <Polyline key={`walked-${walkingRoute.layer}-${walkingRoute.to_place_id}`} positions={walkingRoute.reach.walked} pathOptions={{ className: "ribot-walked-line", color: walkingRoute.layer === "routine" ? "#5fffe8" : walkingRoute.layer === "past" ? "#ff9a87" : "#e2e3de", opacity: 1, weight: present ? 8 : 6 }} />)}
        {!clues && routes?.routes.map((walkingRoute, index) => {
          const labelId = `reach-${walkingRoute.layer}-${walkingRoute.to_place_id}`;
          return <CircleMarker key={labelId} center={[walkingRoute.reach.point.lat, walkingRoute.reach.point.lng]} radius={present ? 10 : 8} pathOptions={{ className: "ribot-reach-marker", color: "#fff", fillColor: "#d9ff62", fillOpacity: 1, weight: 3 }}><Tooltip key={String(suppressedLabels.has(labelId))} permanent direction="right" className={`ribot-reach-label ribot-priority-label ribot-label-id-${labelId} ribot-label-priority-70 ribot-label-order-${index}${suppressedLabels.has(labelId) ? " is-collision-hidden" : ""}`}><strong>{walkingRoute.reach.hours} h · could be here</strong></Tooltip></CircleMarker>;
        })}
        {!clues && routes?.routes.flatMap((walkingRoute) => evenlySample(walkingRoute.cctvs, 16).map((cctv, index) => <Marker key={`cctv-${walkingRoute.to_place_id}-${index}`} position={[cctv.lat, cctv.lng]} icon={cctvIcon()} zIndexOffset={550}><Tooltip direction="right">Public CCTV{cctv.address ? ` · ${cctv.address}` : ""}</Tooltip></Marker>))}
        {reveal && nearestCandidate && <Polyline positions={[[reveal.found.geo.lat, reveal.found.geo.lng], [nearestCandidate.geo.lat, nearestCandidate.geo.lng]]} pathOptions={{ className: "ribot-reveal-line", color: "#ff7058", weight: 2, opacity: 0.9 }}><Tooltip key={String(suppressedLabels.has("reveal-distance"))} permanent direction="right" offset={[78, 0]} className={`ribot-reveal-distance-label ribot-priority-label ribot-label-id-reveal-distance ribot-label-priority-65 ribot-label-order-0${suppressedLabels.has("reveal-distance") ? " is-collision-hidden" : ""}`}>{distanceLabel(nearestDistance!)}</Tooltip></Polyline>}
        {!clues && plan && <Marker position={[plan.last_seen.geo.lat, plan.last_seen.geo.lng]} icon={pinIcon({ kind: "home", label: "", present })} zIndexOffset={500}><Tooltip permanent direction="top" offset={[0, -20]} className="ribot-pin-label ribot-last-seen-label ribot-priority-label ribot-label-id-last ribot-label-priority-100 ribot-label-order-0"><strong>Last seen</strong> · {plan.last_seen.label}</Tooltip></Marker>}
        {!clues && candidates.map((candidate) => {
          const matched = imageryFor(candidate.geo, imagery);
          const color = candidate.layer === "routine" ? "#0f9f91" : candidate.layer === "past" ? "#f05239" : undefined;
          const labelId = `candidate-${candidate.rank}`;
          const priority = candidate.layer === "past" ? 80 : 60;
          const isSuppressed = suppressedLabels.has(labelId);
          return <Marker key={`candidate-${candidate.rank}-${candidate.place_id}`} position={[candidate.geo.lat, candidate.geo.lng]} icon={pinIcon({ kind: "candidate", label: String(candidate.rank), color, badge: candidate.place_id === imageryBadgeCandidateId, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={300 - candidate.rank}><Tooltip key={String(isSuppressed)} permanent={permanentCandidateIds.has(candidate.place_id)} direction={candidate.layer === "routine" ? "right" : "left"} offset={[candidate.layer === "routine" ? 10 : -10, candidate.layer === "routine" ? 12 : -12]} className={`ribot-pin-label ribot-priority-label ribot-label-id-${labelId} ribot-label-priority-${priority} ribot-label-order-${candidate.rank}${candidate.rank === 1 ? " ribot-rank-one-label" : ""}${isSuppressed ? " is-collision-hidden" : ""}`}><strong>#{candidate.rank} {candidate.name}</strong><br />{distanceLabel(candidate.distance_km_from_last_seen)} from last seen</Tooltip></Marker>;
        })}
        {!clues && hazards.map((hazard, index) => {
          const labelId = `hazard-${index}`;
          const isSuppressed = suppressedLabels.has(labelId);
          return <Marker key={`hazard-${hazard.kind}-${hazard.name}-${index}`} position={[hazard.geo.lat, hazard.geo.lng]} icon={hazardIcon(hazard.kind, present)} zIndexOffset={350 - index}><Tooltip key={String(isSuppressed)} permanent={index < 3} direction={index % 2 === 0 ? "right" : "left"} offset={[0, (Math.min(index, 2) - 1) * 30]} className={`ribot-hazard-label ribot-hazard-label--${hazard.kind} ribot-priority-label ribot-label-id-${labelId} ribot-label-priority-40 ribot-label-order-${index}${isSuppressed ? " is-collision-hidden" : ""}`}><strong>{hazard.name}</strong> · {distanceLabel(hazard.distance_km)}</Tooltip></Marker>;
        })}
        {!clues && hubs.map((hub, index) => <Marker key={`hub-${hub.name}-${index}`} position={[hub.geo!.lat, hub.geo!.lng]} icon={pinIcon({ kind: "hub", label: "", present })} zIndexOffset={400}><Tooltip direction="right" className="ribot-pin-label ribot-hub-label"><strong>Send first: {hub.name}</strong><br />{hub.line ? `${hub.line} · ` : ""}{hub.label}</Tooltip></Marker>)}
        {!plan && profilePlaces.map(({ era, eraIndex, place, geo, visible }) => {
          const matched = imageryFor(geo, imagery);
          return <Marker key={`${era.id}-${place.id}`} position={[geo.lat, geo.lng]} opacity={visible ? 1 : 0.22} icon={pinIcon({ kind: "place", label: String(eraIndex + 1), color: ERA_COLORS[eraIndex % ERA_COLORS.length], badge: !!matched, muted: !visible, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={visible ? 200 : 0}><Tooltip key={String(visible)} permanent={visible} direction="right" className="ribot-pin-label"><strong>{place.name_then}</strong><br />{era.label}{yearRange(era.start_year, era.end_year) ? ` · ${yearRange(era.start_year, era.end_year)}` : ""}</Tooltip></Marker>;
        })}
        {reveal && <Marker key={`found-${reveal.case_id}`} position={[reveal.found.geo.lat, reveal.found.geo.lng]} icon={pinIcon({ kind: "found", label: "", present })} zIndexOffset={1000}><Tooltip permanent direction="right" offset={[10, -14]} className="ribot-found-label"><strong>Found</strong> · {reveal.found.label}</Tooltip></Marker>}
      </MapContainer>
      {!plan && eras.length > 0 && <ol className="ribot-era-legend">
        {eras.map((era, eraIndex) => <li key={era.id} className={eraOverlapsDecade(era.start_year, era.end_year, decade) ? "" : "is-muted"}>
          <span className="ribot-era-dot" style={{ background: ERA_COLORS[eraIndex % ERA_COLORS.length] }}>{eraIndex + 1}</span>
          <span><strong>{era.label}</strong>{yearRange(era.start_year, era.end_year) && <><br />{yearRange(era.start_year, era.end_year)}</>}</span>
        </li>)}
      </ol>}
      {outsideCandidates.length > 0 && <div className="ribot-outside-note">
        {outsideCandidates.map((candidate) => <span key={candidate.place_id}>+ {candidate.name} · {Math.round(candidate.distance_km_from_last_seen)} km (outside view)</span>)}
      </div>}
      <div className="ribot-osm-attribution">Esri, Maxar, Earthstar Geographics · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></div>
      <style jsx global>{`
        .ribot-map { position: relative; height: 100%; min-height: 360px; width: 100%; overflow: hidden; background: #171a1c; }
        .ribot-map .leaflet-container { font-family: inherit; background: #171a1c; }
        .ribot-map .ribot-satellite-pane { filter: brightness(.75); }
        .ribot-map .leaflet-control-attribution { color: #d8d9d4; background: rgba(13,15,16,.82); font-size: 10px; }
        .ribot-map .leaflet-control-attribution a { color: #fff; }
        .ribot-osm-attribution { position: absolute; z-index: 500; right: 0; bottom: 0; padding: 3px 6px; color: #c9cbc6; background: rgba(13,15,16,.82); font-size: 10px; line-height: 1.2; }
        .ribot-osm-attribution a { color: inherit; text-decoration: underline; }
        .ribot-pin-wrap { background: transparent; border: 0; transition: opacity .45s ease, filter .45s ease; }
        .ribot-pin-wrap.is-muted { filter: grayscale(.8); }
        .ribot-pin-wrap.has-imagery .ribot-pin { margin-inline: auto; }
        .ribot-pin { --pin-size: 44px; box-sizing: border-box; display: grid; place-items: center; width: var(--pin-size); height: var(--pin-size); color: #fff; background: var(--pin-color); border: 3px solid #fff; border-radius: 50% 50% 50% 12%; box-shadow: 0 5px 18px rgba(0,0,0,.62); font-weight: 900; font-size: 22px; line-height: 1; transform: rotate(-45deg); }
        .ribot-map.is-present .ribot-pin { font-size: 24px; }
        .ribot-pin > span { transform: rotate(45deg); }
        .ribot-pin--home, .ribot-pin--hub { transform: rotate(0); border-radius: 50%; font-size: 27px; color: #11130f; background: #f8f5ea; }
        .ribot-pin--home > span, .ribot-pin--hub > span, .ribot-pin--found > span { transform: none; }
        .ribot-pin--hub { font-size: 22px; background: #fff; }
        .ribot-pin--found { transform: rotate(0); border-radius: 50%; background: #f05239; font-size: 25px; }
        .ribot-clue-wrap { background: transparent; border: 0; }
        .ribot-cctv-wrap { background: transparent; border: 0; }
        .ribot-cctv { display: grid; place-items: center; width: 14px; height: 11px; color: #11130f; background: #f3f2eb; border: 1px solid #11130f; border-radius: 2px; box-shadow: 0 1px 5px rgba(0,0,0,.75); font-size: 8px; transform: rotate(-8deg); }
        .ribot-cctv::after { content: ""; position: absolute; right: -3px; width: 4px; height: 6px; background: #f3f2eb; clip-path: polygon(0 20%,100% 0,100% 100%,0 80%); }
        .ribot-clue-pin { box-sizing: border-box; display: grid; place-items: center; width: var(--clue-size); height: var(--clue-size); color: #fff; background: #8b5cf6; border: 3px solid #f3e8ff; border-radius: 50%; box-shadow: 0 4px 13px rgba(0,0,0,.62); font-size: 17px; font-weight: 900; line-height: 1; }
        .ribot-map.is-present .ribot-clue-pin { font-size: 20px; }
        .ribot-hazard-wrap { background: transparent; border: 0; }
        .ribot-hazard { box-sizing: border-box; display: grid; place-items: center; width: 40px; height: 40px; filter: drop-shadow(0 4px 7px rgba(0,0,0,.65)); font-weight: 900; line-height: 1; }
        .ribot-map.is-present .ribot-hazard { width: 46px; height: 46px; }
        .ribot-hazard--water { color: #e8fbff; background: #168bd2; border: 3px solid #dff8ff; border-radius: 50% 50% 50% 8px; font-size: 13px; transform: rotate(-45deg); }
        .ribot-hazard--water::first-letter { transform: rotate(45deg); }
        .ribot-hazard--hill { color: #6c4b24; font-size: 41px; -webkit-text-stroke: 3px #c8e26a; paint-order: stroke fill; }
        .ribot-pin-wrap.is-found .ribot-pin { animation: ribot-pin-pop .55s cubic-bezier(.2,1.55,.45,1) both; }
        .ribot-imagery-badge { position: absolute; top: 45px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 4px 8px; color: #11130f; background: #d9ff62; border-radius: 999px; box-shadow: 0 3px 10px rgba(0,0,0,.55); font-size: 12px; font-weight: 850; letter-spacing: .02em; cursor: pointer; }
        .ribot-map.is-present .ribot-imagery-badge { top: 51px; font-size: 14px; }
        .ribot-map .leaflet-tooltip { padding: 8px 11px; border: 1px solid rgba(255,255,255,.26); border-radius: 7px; box-shadow: 0 4px 16px rgba(0,0,0,.58); color: #f8f8f3; background: rgba(16,18,17,.94); font-size: 20px; font-weight: 650; line-height: 1.3; }
        .ribot-map.is-present .leaflet-tooltip { font-size: 22px; padding: 9px 12px; }
        .ribot-map .leaflet-tooltip::before { display: none; }
        .ribot-map .leaflet-tooltip.is-collision-hidden { opacity: 0 !important; pointer-events: none; }
        .ribot-map .ribot-circle-label { color: #f0f1ec; background: rgba(70,72,69,.94); font-size: 16px; font-weight: 750; }
        .ribot-map .ribot-clue-radius-label { color: #fff; background: #6d28d9; border-color: #d8b4fe; font-size: 18px; font-weight: 850; }
        .ribot-map .ribot-clue-label { border-color: #c084fc; font-size: 18px; }
        .ribot-map .ribot-hazard-ring-label { color: #18200c; background: #d9ff62; border-color: #efffbd; font-size: 20px; font-weight: 900; }
        .ribot-map .ribot-hazard-label { font-size: 20px; border-width: 2px; }
        .ribot-map .ribot-hazard-label--water { border-color: #43bdf5; }
        .ribot-map .ribot-hazard-label--hill { border-color: #b8d65b; }
        .ribot-map .ribot-distance-label, .ribot-map .ribot-reveal-distance-label { color: #11130f; background: #f5f5ef; border-color: #fff; font-size: 24px; font-weight: 900; }
        .ribot-map .ribot-reach-label { color: #11130f; background: #d9ff62; border-color: #f0ffbd; font-size: 17px; }
        .ribot-map .ribot-walked-line { filter: drop-shadow(0 0 5px currentColor); }
        .ribot-map .ribot-reach-marker { animation: ribot-reach-pulse 1.45s ease-out infinite; transform-box: fill-box; transform-origin: center; }
        .ribot-map .ribot-reveal-distance-label { color: #fff; background: #c83f2a; }
        .ribot-map .ribot-rank-one-label { font-size: 24px; border-color: rgba(217,255,98,.8); }
        .ribot-map .ribot-last-seen-label { font-size: 22px; }
        .ribot-map .ribot-hub-label strong { color: #1d4ed8; }
        .ribot-map .ribot-found-label { color: #fff; border-color: #ff8b76; animation: ribot-fade-in .4s .35s both; }
        .ribot-era-legend { position: absolute; z-index: 500; left: 14px; bottom: 22px; margin: 0; padding: 10px 12px; list-style: none; display: grid; gap: 8px; background: rgba(255,255,255,.92); border-radius: 10px; box-shadow: 0 3px 14px rgba(0,0,0,.14); color: #22221f; font-size: 12px; line-height: 1.3; }
        .ribot-map.is-present .ribot-era-legend { font-size: 15px; padding: 12px 14px; }
        .ribot-era-legend li { display: flex; align-items: center; gap: 9px; transition: opacity .45s ease; }
        .ribot-era-legend li.is-muted { opacity: .35; }
        .ribot-era-dot { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 12px; }
        .ribot-outside-note { position: absolute; z-index: 500; right: 12px; bottom: 18px; display: grid; gap: 3px; max-width: min(360px, 48%); padding: 7px 10px; color: #f3f2eb; background: rgba(16,18,17,.9); border: 1px solid rgba(255,255,255,.25); border-radius: 6px; box-shadow: 0 3px 14px rgba(0,0,0,.35); font-size: 14px; font-weight: 700; line-height: 1.3; }
        .ribot-outside-note span { display: block; }
        @keyframes ribot-pin-pop { 0% { transform: translateY(-25px) scale(.35); opacity: 0; } 70% { transform: translateY(3px) scale(1.12); opacity: 1; } 100% { transform: translateY(0) scale(1); } }
        .ribot-map .ribot-reveal-line { animation: ribot-line-in .45s .42s both; }
        @keyframes ribot-line-in { from { opacity: 0; stroke-dasharray: 1 12; } to { opacity: .9; stroke-dasharray: none; } }
        @keyframes ribot-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ribot-reach-pulse { 0%, 100% { transform: scale(.82); filter: drop-shadow(0 0 0 rgba(217,255,98,.9)); } 55% { transform: scale(1.18); filter: drop-shadow(0 0 10px rgba(217,255,98,.9)); } }
        @media (prefers-reduced-motion: reduce) { .ribot-pin-wrap { transition: none; } .ribot-pin-wrap.is-found .ribot-pin, .ribot-map .ribot-found-label { animation: none; } }
      `}</style>
    </div>
  );
}
