"use client";

import "leaflet/dist/leaflet.css";

import L, { type LatLngExpression, type LatLngTuple } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

import type { EraImagery, LatLng, MapViewProps } from "@/lib/contracts";
import { haversineKm } from "@/lib/metrics";

const FALLBACK_CENTER: LatLngTuple = [36.5, 127.8];
const ERA_COLORS = ["#b45309", "#0f766e", "#4f46e5", "#be123c", "#0369a1", "#7e22ce"];
type PinKind = "candidate" | "home" | "hub" | "place" | "found";

function pinIcon({ kind, label, color, badge, muted = false, present = false, shift = [0, 0] }: {
  kind: PinKind; label: string; color?: string; badge?: boolean; muted?: boolean; present?: boolean; shift?: [number, number];
}) {
  const symbol = kind === "home" ? "⌂" : kind === "hub" ? "🚆" : kind === "found" ? "★" : label;
  const size = present ? 42 : 36;
  return L.divIcon({
    className: `ribot-pin-wrap${muted ? " is-muted" : ""}${kind === "found" ? " is-found" : ""}`,
    html: `<div class="ribot-pin ribot-pin--${kind}" style="--pin-color:${color ?? "#20201e"};--pin-size:${size}px"><span>${symbol}</span></div>${badge ? '<span class="ribot-imagery-badge">Then/Now</span>' : ""}`,
    iconSize: [badge ? 88 : size, size + (badge ? 18 : 0)], iconAnchor: [size / 2 - shift[0], size - shift[1]], tooltipAnchor: [shift[0], shift[1] - size + 4],
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
    map.invalidateSize();
    if (points.length === 1) map.flyTo(points[0], 12, { duration: 0.8 });
    else map.flyToBounds(L.latLngBounds(points), { paddingTopLeft: [70, 70], paddingBottomRight: [70, 70], maxZoom: 13, duration: 1 });
    // Coordinates are serialized so equivalent arrays do not retrigger the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

// A 3 km circle is a few pixels wide when the far hometown is also on screen.
// Keep the true-scale circle and add a minimum-size halo so it stays visible.
const MIN_CIRCLE_PX = 22;
function RadiusCircle({ center, radiusKm, label, present }: { center: LatLng; radiusKm: number; label: string; present: boolean }) {
  const map = useMap();
  const [pixels, setPixels] = useState(0);
  const measure = () => {
    const origin = map.latLngToContainerPoint([center.lat, center.lng]);
    const edge = map.latLngToContainerPoint([center.lat + radiusKm / 111.32, center.lng]);
    setPixels(Math.abs(origin.y - edge.y));
  };
  useMapEvents({ zoomend: measure, moveend: measure });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [map, center.lat, center.lng, radiusKm]);
  const style = { color: "#55554f", fillColor: "#7d7d76", fillOpacity: 0.22, weight: 2 };
  const text = `${label} · ${distanceLabel(radiusKm)}`;
  const tooltip = <Tooltip permanent direction="bottom" offset={[0, Math.max(pixels, MIN_CIRCLE_PX)]} className="ribot-circle-label">{text}</Tooltip>;
  return <>
    <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={style} interactive={false}>{pixels >= MIN_CIRCLE_PX && tooltip}</Circle>
    {pixels < MIN_CIRCLE_PX && <CircleMarker center={[center.lat, center.lng]} radius={present ? MIN_CIRCLE_PX + 4 : MIN_CIRCLE_PX} pathOptions={style} interactive={false}>{tooltip}</CircleMarker>}
  </>;
}

// Pins at (almost) the same spot, e.g. last seen = the station hub = the found point, are fanned out sideways.
const FAN: [number, number][] = [[0, 0], [46, 0], [-46, 0], [0, -46], [46, -46], [-46, -46]];
function fanOut(points: LatLng[]) {
  const placed: LatLng[] = [];
  return points.map((point) => {
    const clash = placed.filter((other) => haversineKm(point, other) < 0.5).length;
    placed.push(point);
    return FAN[Math.min(clash, FAN.length - 1)];
  });
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

  const hubs = plan?.send_first.filter((hub) => hub.geo) ?? [];
  const candidates = plan?.candidates ?? [];
  // Fan order = draw priority: last seen, hubs, candidates, found.
  const shifts = fanOut([
    ...(plan ? [plan.last_seen.geo] : []), ...hubs.map((hub) => hub.geo!), ...candidates.map((candidate) => candidate.geo),
    ...(reveal ? [reveal.found.geo] : []),
  ]);
  const homeShift = plan ? shifts[0] : undefined;
  const hubShift = (index: number) => shifts[(plan ? 1 : 0) + index];
  const candidateShift = (index: number) => shifts[(plan ? 1 : 0) + hubs.length + index];
  const foundShift = reveal ? shifts[shifts.length - 1] : undefined;
  const eras = profile?.eras ?? [];

  return (
    <div className={`ribot-map ${present ? "is-present" : ""}`}>
      <MapContainer center={FALLBACK_CENTER} zoom={7} zoomControl={!present} attributionControl={!present} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={bounds} />
        {plan && <RadiusCircle center={plan.circle.center} radiusKm={plan.circle.radius_km} label={plan.circle.label} present={present} />}
        {route && <Polyline positions={route} pathOptions={{ color: "#292927", dashArray: "8 10", weight: present ? 3 : 2.5 }}><Tooltip permanent direction="center" className="ribot-distance-label">{distanceLabel(routeDistance!)}</Tooltip></Polyline>}
        {reveal && nearestCandidate && <Polyline positions={[[reveal.found.geo.lat, reveal.found.geo.lng], [nearestCandidate.geo.lat, nearestCandidate.geo.lng]]} pathOptions={{ color: "#d94a31", weight: 2, opacity: 0.85 }} />}
        {plan && <Marker position={[plan.last_seen.geo.lat, plan.last_seen.geo.lng]} icon={pinIcon({ kind: "home", label: "", present, shift: homeShift })} zIndexOffset={500}><Tooltip permanent direction="left" className="ribot-pin-label"><strong>Last seen</strong> · {plan.last_seen.label}</Tooltip></Marker>}
        {candidates.map((candidate, index) => {
          const matched = imageryFor(candidate.geo, imagery);
          return <Marker key={`candidate-${candidate.rank}-${candidate.place_id}`} position={[candidate.geo.lat, candidate.geo.lng]} icon={pinIcon({ kind: "candidate", label: String(candidate.rank), badge: !!matched, present, shift: candidateShift(index) })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={300 - candidate.rank}><Tooltip permanent={candidate.rank <= 3} direction="right" className="ribot-pin-label"><strong>#{candidate.rank} {candidate.name}</strong><br />{distanceLabel(candidate.distance_km_from_last_seen)} from last seen</Tooltip></Marker>;
        })}
        {hubs.map((hub, index) => <Marker key={`hub-${hub.name}-${index}`} position={[hub.geo!.lat, hub.geo!.lng]} icon={pinIcon({ kind: "hub", label: "", present, shift: hubShift(index) })} zIndexOffset={400}><Tooltip permanent direction="right" className="ribot-pin-label ribot-hub-label"><strong>Send first: {hub.name}</strong><br />{hub.line ? `${hub.line} · ` : ""}{hub.label}</Tooltip></Marker>)}
        {!plan && profilePlaces.map(({ era, eraIndex, place, geo, visible }) => {
          const matched = imageryFor(geo, imagery);
          return <Marker key={`${era.id}-${place.id}`} position={[geo.lat, geo.lng]} opacity={visible ? 1 : 0.22} icon={pinIcon({ kind: "place", label: String(eraIndex + 1), color: ERA_COLORS[eraIndex % ERA_COLORS.length], badge: !!matched, muted: !visible, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={visible ? 200 : 0}><Tooltip key={String(visible)} permanent={visible} direction="right" className="ribot-pin-label"><strong>{place.name_then}</strong><br />{era.label} · {era.start_year ?? "unknown"}–{era.end_year ?? "unknown"}</Tooltip></Marker>;
        })}
        {reveal && <Marker key={`found-${reveal.case_id}`} position={[reveal.found.geo.lat, reveal.found.geo.lng]} icon={pinIcon({ kind: "found", label: "", present, shift: foundShift })} zIndexOffset={1000}><Tooltip permanent direction="top" className="ribot-found-label"><strong>Found</strong> · {reveal.found.label}</Tooltip></Marker>}
      </MapContainer>
      {!plan && eras.length > 0 && <ol className="ribot-era-legend">
        {eras.map((era, eraIndex) => <li key={era.id} className={eraOverlapsDecade(era.start_year, era.end_year, decade) ? "" : "is-muted"}>
          <span className="ribot-era-dot" style={{ background: ERA_COLORS[eraIndex % ERA_COLORS.length] }}>{eraIndex + 1}</span>
          <span><strong>{era.label}</strong><br />{era.start_year ?? "unknown"}–{era.end_year ?? "unknown"}</span>
        </li>)}
      </ol>}
      {present && <div className="ribot-osm-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</div>}
      <style jsx global>{`
        .ribot-map { position: relative; height: 100%; min-height: 360px; width: 100%; overflow: hidden; background: #e9e8e3; }
        .ribot-map .leaflet-container { font-family: inherit; background: #e9e8e3; }
        .ribot-map .leaflet-tile-pane { filter: saturate(.3) brightness(1.04) contrast(.92); }
        .ribot-map .leaflet-control-attribution { background: rgba(255,255,255,.78); font-size: 10px; }
        .ribot-osm-attribution { position: absolute; z-index: 500; right: 0; bottom: 0; padding: 2px 5px; color: #4b4b47; background: rgba(255,255,255,.74); font-size: 9px; line-height: 1.2; }
        .ribot-osm-attribution a { color: inherit; text-decoration: underline; }
        .ribot-pin-wrap { background: transparent; border: 0; transition: opacity .45s ease, filter .45s ease; }
        .ribot-pin-wrap.is-muted { filter: grayscale(.8); }
        .ribot-pin { --pin-size: 36px; box-sizing: border-box; display: grid; place-items: center; width: var(--pin-size); height: var(--pin-size); color: #fff; background: var(--pin-color); border: 3px solid #fff; border-radius: 50% 50% 50% 12%; box-shadow: 0 4px 13px rgba(21,21,19,.32); font-weight: 850; font-size: 17px; line-height: 1; transform: rotate(-45deg); }
        .ribot-map.is-present .ribot-pin { font-size: 20px; }
        .ribot-pin > span { transform: rotate(45deg); }
        .ribot-pin--home, .ribot-pin--hub { transform: rotate(0); border-radius: 50%; font-size: 24px; color: #191917; background: #f8f5ea; }
        .ribot-pin--home > span, .ribot-pin--hub > span, .ribot-pin--found > span { transform: none; }
        .ribot-pin--hub { font-size: 18px; background: #fff; }
        .ribot-pin--found { transform: rotate(0); border-radius: 50%; background: #d94a31; font-size: 21px; }
        .ribot-pin-wrap.is-found .ribot-pin { animation: ribot-pin-pop .55s cubic-bezier(.2,1.55,.45,1) both; }
        .ribot-imagery-badge { position: absolute; top: 37px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 3px 7px; color: #fff; background: #171715; border-radius: 999px; box-shadow: 0 2px 7px rgba(0,0,0,.24); font-size: 10px; font-weight: 750; letter-spacing: .02em; cursor: pointer; }
        .ribot-map.is-present .ribot-imagery-badge { top: 43px; font-size: 12px; }
        .ribot-map .leaflet-tooltip { padding: 6px 9px; border: 0; border-radius: 7px; box-shadow: 0 2px 10px rgba(0,0,0,.16); color: #22221f; font-size: 12px; line-height: 1.35; }
        .ribot-map.is-present .leaflet-tooltip { font-size: 15px; padding: 8px 11px; }
        .ribot-map .ribot-circle-label { color: #44443f; background: rgba(255,255,255,.85); font-weight: 700; }
        .ribot-map .ribot-circle-label::before, .ribot-map .ribot-distance-label::before { display: none; }
        .ribot-map .ribot-distance-label { font-weight: 800; background: #fff; }
        .ribot-map .ribot-hub-label strong { color: #1d4ed8; }
        .ribot-map .ribot-found-label { color: #a52f1d; animation: ribot-fade-in .4s .35s both; }
        .ribot-era-legend { position: absolute; z-index: 500; left: 14px; bottom: 22px; margin: 0; padding: 10px 12px; list-style: none; display: grid; gap: 8px; background: rgba(255,255,255,.92); border-radius: 10px; box-shadow: 0 3px 14px rgba(0,0,0,.14); color: #22221f; font-size: 12px; line-height: 1.3; }
        .ribot-map.is-present .ribot-era-legend { font-size: 15px; padding: 12px 14px; }
        .ribot-era-legend li { display: flex; align-items: center; gap: 9px; transition: opacity .45s ease; }
        .ribot-era-legend li.is-muted { opacity: .35; }
        .ribot-era-dot { display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 12px; }
        @keyframes ribot-pin-pop { 0% { transform: translateY(-25px) scale(.35); opacity: 0; } 70% { transform: translateY(3px) scale(1.12); opacity: 1; } 100% { transform: translateY(0) scale(1); } }
        @keyframes ribot-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ribot-pin-wrap { transition: none; } .ribot-pin-wrap.is-found .ribot-pin, .ribot-map .ribot-found-label { animation: none; } }
      `}</style>
    </div>
  );
}
