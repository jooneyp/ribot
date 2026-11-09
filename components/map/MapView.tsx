"use client";
// OWNER: lane C (map). Default export, consumed by lane D via next/dynamic({ ssr: false }).
import type { MapViewProps } from "@/lib/contracts";

export default function MapView(_props: MapViewProps) {
  return <div className="h-full w-full bg-neutral-200 grid place-items-center text-neutral-500">map (lane C)</div>;
}
