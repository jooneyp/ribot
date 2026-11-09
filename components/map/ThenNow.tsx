"use client";
// OWNER: lane C (map). Drag-to-compare "then / now" aerial photos of the same place.
import type { EraImagery } from "@/lib/contracts";

export default function ThenNow({ imagery, onClose }: { imagery: EraImagery; onClose?: () => void }) {
  return (
    <div className="p-4" onClick={onClose}>
      {imagery.place_label} {imagery.then.year} / {imagery.now.year} (lane C)
    </div>
  );
}
