import type { Metadata } from "next";

import { Deck } from "@/components/deck/Deck";

export const metadata: Metadata = {
  title: "Ribot — Deck",
  description: "Why a person's past belongs on today's search map.",
};

export default function DeckPage() {
  return <Deck />;
}
