import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });
import { footballApi } from "../src/lib/football-api/client";

const season = Number(process.env.FOOTBALL_SEASON ?? "2026");
if (!Number.isInteger(season) || season < 2000 || season > 2100) throw new Error("FOOTBALL_SEASON must be a valid four-digit season start year");

const [epl, laliga] = await Promise.all([
  footballApi.searchLeagues("Premier League", season),
  footballApi.searchLeagues("La Liga", season),
]);

function print(label: string, candidates: typeof epl) {
  console.log(`\\n${label} candidates for ${season}/${season + 1}:`);
  for (const item of candidates) {
    const seasonInfo = item.seasons?.find(s => s.year === season);
    console.log(JSON.stringify({ id: item.league.id, name: item.league.name, country: item.country.name, season: seasonInfo?.year, start: seasonInfo?.start, end: seasonInfo?.end, current: seasonInfo?.current, coverage: seasonInfo?.coverage }, null, 2));
  }
  if (!candidates.length) console.warn(`No ${label} candidates returned. Check the API plan, spelling, and season.`);
}
print("Premier League", epl);
print("LaLiga", laliga);
console.log("\\nDiscovery only: no IDs are written to the database automatically. Confirm league IDs and coverage before seeding.");
