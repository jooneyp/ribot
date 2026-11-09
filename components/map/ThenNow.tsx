"use client";

import Image from "next/image";
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EraImagery } from "@/lib/contracts";

export default function ThenNow({ imagery, onClose }: { imagery: EraImagery; onClose?: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const moveToPointer = useCallback((clientX: number) => {
    const bounds = panelRef.current?.getBoundingClientRect();
    if (bounds?.width) setSplit(Math.max(3, Math.min(97, ((clientX - bounds.left) / bounds.width) * 100)));
  }, []);
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); moveToPointer(event.clientX);
  };

  return (
    <section ref={panelRef} className={`relative isolate h-full min-h-[480px] w-full overflow-hidden bg-[#171714] text-white select-none ${dragging ? "cursor-col-resize" : ""}`} aria-label={`${imagery.place_label}: then and now image comparison`}>
      <div className="absolute inset-0"><Image src={imagery.now.src} alt={`${imagery.place_label} in ${imagery.now.year}`} fill unoptimized priority draggable={false} className="pointer-events-none object-cover" sizes="100vw" /></div>
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${split}%` }}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${10000 / split}%` }}><Image src={imagery.then.src} alt={`${imagery.place_label} in ${imagery.then.year}`} fill unoptimized priority draggable={false} className="pointer-events-none object-cover" sizes="100vw" /></div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/60 to-transparent p-6 pb-16 md:p-9 md:pb-20">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70 md:text-sm">Then</p><p className="text-3xl font-black tracking-tight drop-shadow md:text-5xl">{imagery.then.year}</p></div>
        <div className="pt-14 pr-14 text-right md:pt-10 md:pr-20"><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70 md:text-sm">Now</p><p className="text-3xl font-black tracking-tight drop-shadow md:text-5xl">{imagery.now.year}</p></div>
      </div>
      <button type="button" aria-label={`Drag to compare. ${Math.round(split)} percent then image shown`} className="absolute inset-y-0 z-20 w-12 -translate-x-1/2 cursor-col-resize touch-none focus:outline-none focus-visible:ring-4 focus-visible:ring-white/80" style={{ left: `${split}%` }} onPointerDown={beginDrag} onPointerMove={(event) => { if (dragging) moveToPointer(event.clientX); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); }} onPointerCancel={() => setDragging(false)} onKeyDown={(event) => { if (event.key === "ArrowLeft") setSplit((value) => Math.max(3, value - 2)); if (event.key === "ArrowRight") setSplit((value) => Math.min(97, value + 2)); }}>
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(0,0,0,.8)]" /><span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-[#1e1e1a]/85 text-xl font-bold shadow-xl md:h-14 md:w-14">↔</span>
      </button>
      {onClose && <button type="button" onClick={onClose} aria-label="Close Then/Now comparison" className="absolute right-5 top-5 z-30 grid h-11 w-11 place-items-center rounded-full border border-white/35 bg-black/65 text-2xl leading-none backdrop-blur hover:bg-black/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 md:right-8 md:top-8">×</button>}
      {imagery.photo && <figure className="absolute bottom-20 right-5 z-10 w-36 rotate-2 bg-[#f6f2e8] p-2 pb-7 text-[#25251f] shadow-2xl md:bottom-24 md:right-9 md:w-52 md:p-3 md:pb-9"><div className="relative aspect-[4/3] overflow-hidden bg-neutral-300"><Image src={imagery.photo.src} alt={imagery.photo.caption} fill unoptimized draggable={false} className="object-cover" sizes="208px" /></div><figcaption className="mt-2 line-clamp-2 text-center text-[10px] font-medium leading-tight md:text-xs">{imagery.photo.caption}</figcaption></figure>}
      <footer className="absolute inset-x-0 bottom-0 z-30 flex min-h-16 items-center justify-between gap-5 bg-[#171714]/90 px-5 py-3 text-xs backdrop-blur md:px-9 md:text-sm">
        <div className="min-w-0"><p className="truncate font-semibold text-white">{imagery.place_label}</p><p className="truncate text-white/62">Drag the divider to compare the same place.</p></div>
        <a href={imagery.source_url} target="_blank" rel="noreferrer" className="shrink-0 text-right font-medium text-white/75 underline decoration-white/35 underline-offset-4 hover:text-white">Source: {imagery.source}</a>
      </footer>
    </section>
  );
}
