import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { footballApi } from "@/lib/football-api/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const expectedToken = process.env.FOOTBALL_DISCOVERY_TOKEN;
  const suppliedToken = (await headers()).get("authorization")?.replace(/^Bearer\\s+/i, "");
  if (process.env.NODE_ENV === "production" && (!expectedToken || suppliedToken !== expectedToken)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const season = Number(process.env.FOOTBALL_SEASON ?? "2026");
    const [premierLeague, laLiga] = await Promise.all([
      footballApi.searchLeagues("Premier League", season),
      footballApi.searchLeagues("La Liga", season),
    ]);
    return NextResponse.json({ season, competitions: { EPL: premierLeague, LALIGA: laLiga } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Discovery failed" }, { status: 502 });
  }
}
