"use client";

import "leaflet/dist/leaflet.css";

import L, { type LatLngBoundsExpression, type LatLngExpression, type LatLngTuple } from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import type { EraImagery, LatLng, MapViewProps } from "@/lib/contracts";
import { haversineKm } from "@/lib/metrics";

const KOREA_BOUNDS: LatLngBoundsExpression = [[33, 125], [38.6, 129.8]];
const ERA_COLORS = ["#b45309", "#0f766e", "#4f46e5", "#be123c", "#0369a1", "#7e22ce"];
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
    if (points.length === 1) map.flyTo(points[0], 12, { duration: 0.85 });
    else map.flyToBounds(L.latLngBounds(points), {
      paddingTopLeft: [170, 110],
      paddingBottomRight: [220, 130],
      maxZoom: 13,
      duration: 1.15,
    });
    // Coordinates are serialized so equivalent arrays do not retrigger the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

function RadiusCircle({ center, radiusKm, label }: { center: LatLng; radiusKm: number; label: string }) {
  const style = { color: "#e2e3de", fillColor: "#a8aaa4", fillOpacity: 0.38, opacity: 1, weight: 5 };
  const latitudeRadius = radiusKm / 111.32;
  return <>
    <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={style} interactive={false} />
    <CircleMarker center={[center.lat - latitudeRadius, center.lng]} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }} interactive={false}>
      <Tooltip permanent direction="bottom" offset={[0, 8]} className="ribot-circle-label">{label} · {distanceLabel(radiusKm)}</Tooltip>
    </CircleMarker>
  </>;
}

const distanceLabel = (distance: number) => distance < 10 ? `${distance.toFixed(1)} km` : `${Math.round(distance)} km`;

export default function MapView({ plan, profile, decade, reveal, imagery, onSelectImagery, present = false, clues }: MapViewProps) {
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
    if (clues) {
      const latitudeRadius = clues.radius_km / 111.32;
      const longitudeRadius = latitudeRadius / Math.max(0.1, Math.cos(clues.center.lat * Math.PI / 180));
      points.push(...clues.spots.map((spot) => [spot.geo.lat, spot.geo.lng] as LatLngTuple));
      points.push(
        [clues.center.lat + latitudeRadius, clues.center.lng + longitudeRadius],
        [clues.center.lat - latitudeRadius, clues.center.lng - longitudeRadius],
      );
    } else if (plan) {
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
  }, [clues, plan, profilePlaces, reveal]);

  const topCandidate = plan?.candidates.find((candidate) => candidate.rank === 1);
  const route = plan && topCandidate ? [[plan.last_seen.geo.lat, plan.last_seen.geo.lng], [topCandidate.geo.lat, topCandidate.geo.lng]] as LatLngTuple[] : null;
  const routeDistance = plan && topCandidate ? haversineKm(plan.last_seen.geo, topCandidate.geo) : null;
  const nearestDistance = reveal && nearestCandidate ? haversineKm(reveal.found.geo, nearestCandidate.geo) : null;

  const hubs = plan?.send_first.filter((hub) => hub.geo) ?? [];
  const candidates = plan?.candidates ?? [];
  const eras = profile?.eras ?? [];

  return (
    <div className={`ribot-map ${present ? "is-present" : ""}`}>
      <MapContainer bounds={KOREA_BOUNDS} boundsOptions={{ padding: [28, 28] }} zoomControl={!present} attributionControl={false} className="h-full w-full">
        <TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <FitBounds points={bounds} />
        {clues ? <RadiusCircle center={clues.center} radiusKm={clues.radius_km} label="Phone area" /> : plan && <RadiusCircle center={plan.circle.center} radiusKm={plan.circle.radius_km} label={plan.circle.label} />}
        {!clues && route && <Polyline positions={route} pathOptions={{ color: "#f0f1eb", dashArray: "10 12", opacity: 0.9, weight: present ? 4 : 3 }}><Tooltip permanent direction="center" className="ribot-distance-label">{distanceLabel(routeDistance!)}</Tooltip></Polyline>}
        {reveal && nearestCandidate && <Polyline positions={[[reveal.found.geo.lat, reveal.found.geo.lng], [nearestCandidate.geo.lat, nearestCandidate.geo.lng]]} pathOptions={{ className: "ribot-reveal-line", color: "#ff7058", weight: 2, opacity: 0.9 }}><Tooltip permanent direction="right" offset={[78, 0]} className="ribot-reveal-distance-label">{distanceLabel(nearestDistance!)}</Tooltip></Polyline>}
        {!clues && plan && <Marker position={[plan.last_seen.geo.lat, plan.last_seen.geo.lng]} icon={pinIcon({ kind: "home", label: "", present })} zIndexOffset={500}><Tooltip permanent direction="left" className="ribot-pin-label ribot-last-seen-label"><strong>Last seen</strong> · {plan.last_seen.label}</Tooltip></Marker>}
        {!clues && candidates.map((candidate) => {
          const matched = imageryFor(candidate.geo, imagery);
          return <Marker key={`candidate-${candidate.rank}-${candidate.place_id}`} position={[candidate.geo.lat, candidate.geo.lng]} icon={pinIcon({ kind: "candidate", label: String(candidate.rank), badge: !!matched, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={300 - candidate.rank}><Tooltip permanent={candidate.rank <= 3} direction="right" className={`ribot-pin-label${candidate.rank === 1 ? " ribot-rank-one-label" : ""}`}><strong>#{candidate.rank} {candidate.name}</strong><br />{distanceLabel(candidate.distance_km_from_last_seen)} from last seen</Tooltip></Marker>;
        })}
        {!clues && hubs.map((hub, index) => <Marker key={`hub-${hub.name}-${index}`} position={[hub.geo!.lat, hub.geo!.lng]} icon={pinIcon({ kind: "hub", label: "", present })} zIndexOffset={400}><Tooltip direction="right" className="ribot-pin-label ribot-hub-label"><strong>Send first: {hub.name}</strong><br />{hub.line ? `${hub.line} · ` : ""}{hub.label}</Tooltip></Marker>)}
        {clues?.spots.map((spot, index) => <Marker key={`clue-${spot.name}-${spot.keyword}`} position={[spot.geo.lat, spot.geo.lng]} icon={pinIcon({ kind: "candidate", label: String(index + 1), present })} zIndexOffset={600 - index}><Tooltip permanent={index === 0} direction="right" className="ribot-pin-label ribot-clue-label"><strong>#{index + 1} {spot.name}</strong><br />{spot.keyword} · {distanceLabel(spot.distance_km)}{spot.near.length > 0 && <><br />next to: {spot.near.join(", ")}</>}</Tooltip></Marker>)}
        {!plan && profilePlaces.map(({ era, eraIndex, place, geo, visible }) => {
          const matched = imageryFor(geo, imagery);
          return <Marker key={`${era.id}-${place.id}`} position={[geo.lat, geo.lng]} opacity={visible ? 1 : 0.22} icon={pinIcon({ kind: "place", label: String(eraIndex + 1), color: ERA_COLORS[eraIndex % ERA_COLORS.length], badge: !!matched, muted: !visible, present })} eventHandlers={matched && onSelectImagery ? { click: () => onSelectImagery(matched.id) } : undefined} zIndexOffset={visible ? 200 : 0}><Tooltip key={String(visible)} permanent={visible} direction="right" className="ribot-pin-label"><strong>{place.name_then}</strong><br />{era.label} · {era.start_year ?? "unknown"}–{era.end_year ?? "unknown"}</Tooltip></Marker>;
        })}
        {reveal && <Marker key={`found-${reveal.case_id}`} position={[reveal.found.geo.lat, reveal.found.geo.lng]} icon={pinIcon({ kind: "found", label: "", present })} zIndexOffset={1000}><Tooltip permanent direction="right" offset={[10, -14]} className="ribot-found-label"><strong>Found</strong> · {reveal.found.label}</Tooltip></Marker>}
      </MapContainer>
      {!plan && eras.length > 0 && <ol className="ribot-era-legend">
        {eras.map((era, eraIndex) => <li key={era.id} className={eraOverlapsDecade(era.start_year, era.end_year, decade) ? "" : "is-muted"}>
          <span className="ribot-era-dot" style={{ background: ERA_COLORS[eraIndex % ERA_COLORS.length] }}>{eraIndex + 1}</span>
          <span><strong>{era.label}</strong><br />{era.start_year ?? "unknown"}–{era.end_year ?? "unknown"}</span>
        </li>)}
      </ol>}
      <div className="ribot-osm-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a></div>
      <style jsx global>{`
        .ribot-map { position: relative; height: 100%; min-height: 360px; width: 100%; overflow: hidden; background: #171a1c; }
        .ribot-map .leaflet-container { font-family: inherit; background: #171a1c; }
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
        .ribot-pin-wrap.is-found .ribot-pin { animation: ribot-pin-pop .55s cubic-bezier(.2,1.55,.45,1) both; }
        .ribot-imagery-badge { position: absolute; top: 45px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 4px 8px; color: #11130f; background: #d9ff62; border-radius: 999px; box-shadow: 0 3px 10px rgba(0,0,0,.55); font-size: 12px; font-weight: 850; letter-spacing: .02em; cursor: pointer; }
        .ribot-map.is-present .ribot-imagery-badge { top: 51px; font-size: 14px; }
        .ribot-map .leaflet-tooltip { padding: 8px 11px; border: 1px solid rgba(255,255,255,.26); border-radius: 7px; box-shadow: 0 4px 16px rgba(0,0,0,.58); color: #f8f8f3; background: rgba(16,18,17,.94); font-size: 20px; font-weight: 650; line-height: 1.3; }
        .ribot-map.is-present .leaflet-tooltip { font-size: 22px; padding: 9px 12px; }
        .ribot-map .leaflet-tooltip::before { display: none; }
        .ribot-map .ribot-circle-label { color: #f0f1ec; background: rgba(70,72,69,.94); font-size: 16px; font-weight: 750; }
        .ribot-map .ribot-distance-label, .ribot-map .ribot-reveal-distance-label { color: #11130f; background: #f5f5ef; border-color: #fff; font-size: 24px; font-weight: 900; }
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
        @keyframes ribot-pin-pop { 0% { transform: translateY(-25px) scale(.35); opacity: 0; } 70% { transform: translateY(3px) scale(1.12); opacity: 1; } 100% { transform: translateY(0) scale(1); } }
        .ribot-map .ribot-reveal-line { animation: ribot-line-in .45s .42s both; }
        @keyframes ribot-line-in { from { opacity: 0; stroke-dasharray: 1 12; } to { opacity: .9; stroke-dasharray: none; } }
        @keyframes ribot-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .ribot-pin-wrap { transition: none; } .ribot-pin-wrap.is-found .ribot-pin, .ribot-map .ribot-found-label { animation: none; } }
      `}</style>
    </div>
  );
}
