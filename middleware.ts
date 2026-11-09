// OWNER: Joe. Public demo guard: the model calls run on the owner's subscription,
// so visitors coming through the Cloudflare tunnel get a small per-IP budget.
// Local requests (recording, development) carry no cf-connecting-ip and are not limited.
import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 30;
const hits = new Map<string, number[]>();

export function middleware(req: NextRequest) {
  if (req.method !== "POST") return NextResponse.next();
  const ip = req.headers.get("cf-connecting-ip");
  if (!ip) return NextResponse.next();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    return NextResponse.json(
      { error: "This public demo is rate limited. Please try again in a few minutes." },
      { status: 429 },
    );
  }
  recent.push(now);
  hits.set(ip, recent);
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
