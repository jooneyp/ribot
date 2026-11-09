// FROZEN (Joe). Public imagery (data/era_imagery.json) + optional local-only family imagery (data/local/, gitignored).
import fs from "node:fs";
import path from "node:path";
import { EraImagery } from "@/lib/contracts";

export const dynamic = "force-dynamic";

function load(p: string) {
  const fp = path.join(process.cwd(), p);
  if (!fs.existsSync(fp)) return [];
  return (JSON.parse(fs.readFileSync(fp, "utf8")) as unknown[]).map((e) => EraImagery.parse(e));
}

export async function GET() {
  return Response.json([...load("data/era_imagery.json"), ...load("data/local/era_imagery.local.json")]);
}
