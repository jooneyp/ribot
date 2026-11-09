"use client";

import "leaflet/dist/leaflet.css";

import L, { type LatLngExpression, type LatLngTuple } from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import type { EraImagery, LatLng, MapViewProps } from "@/lib/contracts";
import { haversineKm } from "@/lib/metrics";

const FALLBACK_CENTER: LatLngTuple = [36.5, 127.8];
const ERA_COLORS = ["#b45309", "#0f766e", "#4f46e5", "#be123c", "#0369a1", "#7e22ce"];
type PinKind = "candidate" | "home" | "hub" | "place" | "found";

function pinIcon({ kind, label, color, badge, muted = false, present = false }: {
  kind: PinKind; label: string; color?: string; badge?: boolean; muted?: boolean; present?: boolean;
}) {
  const symbol = kind === "home" ? "⌂" : kind === "hub" ? "🚆" : kind === "found" ? "★" : label;
  const size = present ? 42 : 36;
  return L.divIcon({
    className: `ribot-pin-wrap${muted ? " is-muted" : ""}${kind === "found" ? " is-found" : ""}`,
    html: `<div class="ribot-pin ribot-pin--${kind}" style="--pin-color:${color ?? "#20201e"};--pin-size:${size}px"><span>${symbol}</span></div>${badge ? '<span class="ribot-imagery-badge">Then/Now</span>' : ""}`,
    iconSize: [badge ? 88 : size, size + (badge ? 18 : 0)], iconAnchor: [size / 2, size], tooltipAnchor: [0, -size + 4],
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

function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  const signature = JSON.stringify(points);
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.flyTo(points[0], 12, { duration: 0.8 });
    else map.flyToBounds(L.latLngBounds(points), { paddingTopLeft: [70, 70], paddingBottomRight: [70, 70], maxZoom: 13, duration: 1 });
    // Coordinates are serialized so equivalent arrays do not retrigger the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

const distanceLabel = (distance: number) => distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance)} km`;

export default function MapView({ plan, profile, decade, reveal, imagery, onSelectImagery, present = false }: MapViewProps) {
  const profilePlaces = useMemo(() => (profile?.eras ?? []).flatMap((era, eraIndex) =>
    era.places.filter((place) => place.geo).map((place) => ({
      era, eraIndex, place, geo: place.geo!, visible: eraOverlapsDecade(era.start_year, era.end_year, decade),
    }))), [profile, decade]);

  const nearestCandidate = reveal?.found.geo ? plan?.candidates.reduce<(typeof plan.candidates)[number] | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    return haversineKm(reveal.found.geo, candidate.geo) < haversineKm(reveal.found.geo, nearest.geo) ? candidate : nearest;
  }, null) : null;

  const bounds = useMemo<LatLngExpression[]>(() => {
    const points: LatLngExpression[] = [];
    if (plan) {
      points.push([plan.last_seen.geo.lat, plan.last_seen.geo.lng]);
      points.push(...plan.candidates.map((candidate) => [candidate.geo.lat, candidate.geo.lng] as LatLngTuple));
      points.push(...plan.send_first.filter((hub) => hub.geo).map((hub) => [hub.geo!.lat, hub.geo!.lng] as LatLngTuple));
      const latitudeRadius = plan.circle.radius_km / 111.32;
      const longitudeRadius = latitudeRadius / Math.max(0.1, Math.cos(plan.circle.center.lat * Math.PI / 180));
      points.push(
        [plan.circle.center.lat + latitudeRadius, plan.circle.center.lng + longitudeRadius],
        [plan.circle.center.lat - latitudeRadius, plan.circle.center.lng - longitudeRadius],
      );
    } else points.push(...profilePlaces.map(({ geo }) => [geo.lat, geo.lng] as LatLngTuple));
    if (reveal) points.push([reveal.found.geo.lat, reveal.found.geo.lng]);
    return points;
  }, [plan, profilePlaces, reveal]);

  const topCandidate = plan?.candidates.find((candidate) => candidate.rank === 1);
  const route = plan && topCandidate ? [[plan.last_seen.geo.lat, plan.last_seen.geo.lng], [topCandidate.geo.lat, topCandidate.geo.lng]] as LatLngTuple[] : null;
  const routeDistance = plan && topCandidate ? haversineKm(plan.last_seen.geo, topCandidate.geo) : null;

  return (
    <div className={`ribot-map ${present ? "is-present" : ""}`}>
      <MapContainer center={FALLBACK_CENTER} zoom={7} zoomControl={!present} attributionControl={!present} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={bounds} />
        {plan && <Circle center={[plan.circle.center.lat, plan.circle.center.lng]} radius={plan.circle.radius_km * 1000} pathOptions={{ color: "#666661", fillColor: "#8b8b84", fillOpacity: 0.2, weight: 2 }}><Tooltip permanent direction="center" className="ribot-circle-label">{plan.circle.label}</Tooltip></Circle>}
        {route && <Polyline positions={route} pathOptions={{ color: "#292927", dashArray: "8 10", weight: 2.5 }}><Tooltip permanent direction="center" className="ribot-distance-label">{distanceLabel(routeDistance!)}</Tooltip></Polyline>}
        {plan && <Marker position={[plan.last_seen.geo.lat, plan.last_seen.geo.lng]} icon={pinIcon({ kind: "home", label: "", present })} zIndexOffset={500}><Tooltip direction="top"><strong>Last seen</strong><br />{plan.last_seen.label}</Tooltip></Marker>}
        {plan?.candidates.map((candidate) => {
          const matched = imageryFor(candidate.geo, imagery);
          return <Marker key={`candidate-${candidate.rank}-${candidate.place_id}`} position={[candidate.geo.lat, candidate.geo.lng]} icon={pinIcon({ kind: "candidate", label: String(candidate.rank), badge: !!matched, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={300 - candidate.rank}><Tooltip direction="top"><strong>#{candidate.rank} {candidate.name}</strong><br />{distanceLabel(candidate.distance_km_from_last_seen)} from last seen</Tooltip></Marker>;
        })}
        {plan?.send_first.map((hub, index) => hub.geo ? <Marker key={`hub-${hub.name}-${index}`} position={[hub.geo.lat, hub.geo.lng]} icon={pinIcon({ kind: "hub", label: "", present })} zIndexOffset={400}><Tooltip direction="top"><strong>{hub.name}</strong><br />{hub.line ? `${hub.line} · ` : ""}{hub.label}</Tooltip></Marker> : null)}
        {!plan && profilePlaces.map(({ era, eraIndex, place, geo, visible }) => {
          const matched = imageryFor(geo, imagery);
          return <Marker key={`${era.id}-${place.id}`} position={[geo.lat, geo.lng]} opacity={visible ? 1 : 0.14} icon={pinIcon({ kind: "place", label: String(eraIndex + 1), color: ERA_COLORS[eraIndex % ERA_COLORS.length], badge: !!matched, muted: !visible, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined}><Tooltip direction="top"><strong>{place.name_then}</strong><br />{era.label}<br />{era.start_year ?? "unknown"}–{era.end_year ?? "unknown"}</Tooltip></Marker>;
        })}
        {reveal && <Marker position={[reveal.found.geo.lat, reveal.found.geo.lng]} icon={pinIcon({ kind: "found", label: "", present })} zIndexOffset={1000}><Tooltip permanent direction="top" className="ribot-found-label"><strong>Found</strong> · {reveal.found.label}</Tooltip></Marker>}
        {reveal && nearestCandidate && <Polyline positions={[[reveal.found.geo.lat, reveal.found.geo.lng], [nearestCandidate.geo.lat, nearestCandidate.geo.lng]]} pathOptions={{ color: "#d94a31", weight: 2, opacity: 0.8 }} />}
      </MapContainer>
      {present && <div className="ribot-osm-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</div>}
      <style jsx global>{`
        .ribot-map { position: relative; height: 100%; min-height: 360px; width: 100%; overflow: hidden; background: #e9e8e3; }
        .ribot-map .leaflet-container { font-family: inherit; background: #e9e8e3; }
        .ribot-map .leaflet-control-attribution { background: rgba(255,255,255,.78); font-size: 10px; }
        .ribot-osm-attribution { position: absolute; z-index: 500; right: 0; bottom: 0; padding: 2px 5px; color: #4b4b47; background: rgba(255,255,255,.74); font-size: 9px; line-height: 1.2; }
        .ribot-osm-attribution a { color: inherit; text-decoration: underline; }
        .ribot-pin-wrap { background: transparent; border: 0; transition: opacity .45s ease, transform .45s ease; }
        .ribot-pin-wrap.is-muted { filter: grayscale(.5); }
        .ribot-pin { --pin-size: 36px; box-sizing: border-box; display: grid; place-items: center; width: var(--pin-size); height: var(--pin-size); color: #fff; background: var(--pin-color); border: 3px solid #fff; border-radius: 50% 50% 50% 12%; box-shadow: 0 4px 13px rgba(21,21,19,.32); font-weight: 850; font-size: 17px; line-height: 1; transform: rotate(-45deg); }
        .ribot-pin > span { transform: rotate(45deg); }
        .ribot-pin--candidate, .ribot-pin--place { text-indent: 0; }
        .ribot-pin--home, .ribot-pin--hub { transform: rotate(0); border-radius: 50%; font-size: 24px; color: #191917; background: #f8f5ea; }
        .ribot-pin--home > span, .ribot-pin--hub > span, .ribot-pin--found > span { transform: none; }
        .ribot-pin--hub { font-size: 18px; background: #fff; }
        .ribot-pin--found { transform: rotate(0); border-radius: 50%; background: #d94a31; font-size: 21px; }
        .ribot-pin-wrap.is-found .ribot-pin { animation: ribot-pin-pop .55s cubic-bezier(.2,1.55,.45,1) both; }
        .ribot-imagery-badge { position: absolute; top: 37px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 3px 7px; color: #fff; background: #171715; border-radius: 999px; box-shadow: 0 2px 7px rgba(0,0,0,.24); font-size: 10px; font-weight: 750; letter-spacing: .02em; }
        .ribot-map.is-present .ribot-imagery-badge { top: 43px; font-size: 12px; }
        .ribot-map .leaflet-tooltip { padding: 6px 9px; border: 0; border-radius: 7px; box-shadow: 0 2px 10px rgba(0,0,0,.16); color: #22221f; font-size: 12px; }
        .ribot-map.is-present .leaflet-tooltip { font-size: 15px; padding: 8px 11px; }
        .ribot-map .ribot-circle-label { color: #51514c; background: rgba(255,255,255,.75); font-weight: 700; box-shadow: none; }
        .ribot-map .ribot-distance-label { font-weight: 800; background: #fff; }
        .ribot-map .ribot-found-label { color: #a52f1d; }
        @keyframes ribot-pin-pop { 0% { transform: translateY(-25px) scale(.35); opacity: 0; } 70% { transform: translateY(3px) scale(1.12); opacity: 1; } 100% { transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) { .ribot-pin-wrap { transition: none; } .ribot-pin-wrap.is-found .ribot-pin { animation: none; } }
      `}</style>
    </div>
  );
}
