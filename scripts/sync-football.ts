import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { clubs, competitions, fixtures, seasons } from "../src/db/schema";
import { footballApi, type LeagueCandidate } from "../src/lib/football-api/client";

const seasonYear = Number(process.env.FOOTBALL_SEASON ?? "2026");
const from = process.env.SYNC_FROM ?? `${seasonYear}-07-01`;
const to = process.env.SYNC_TO ?? `${seasonYear + 1}-06-30`;
const configured = [
  { code: "EPL" as const, name: "Premier League", country: "England", search: "Premier League", id: process.env.API_FOOTBALL_EPL_LEAGUE_ID },
  { code: "LALIGA" as const, name: "LaLiga", country: "Spain", search: "La Liga", id: process.env.API_FOOTBALL_LALIGA_LEAGUE_ID },
];

const seasonLabel = `${seasonYear}-${seasonYear + 1}`;
let [season] = await db.select().from(seasons).where(eq(seasons.label, seasonLabel)).limit(1);
if (!season) [season] = await db.insert(seasons).values({ label: seasonLabel, isCurrent: true }).returning();

for (const item of configured) {
  if (!item.id) throw new Error(`Set API_FOOTBALL_${item.code === "EPL" ? "EPL" : "LALIGA"}_LEAGUE_ID after running npm run football:discover`);
  const providerLeagueId = Number(item.id);
  const candidates = await footballApi.searchLeagues(item.search, seasonYear);
  const selected: LeagueCandidate | undefined = candidates.find(c => c.league.id === providerLeagueId);
  if (!selected) throw new Error(`Configured provider league ${providerLeagueId} was not returned for ${item.search}, season ${seasonYear}. Re-run discovery and verify coverage.`);
  const seasonMeta = selected.seasons?.find(s => s.year === seasonYear);
  if (!seasonMeta) throw new Error(`Provider has no ${seasonYear} season metadata for ${item.name}`);

  let [competition] = await db.select().from(competitions).where(and(eq(competitions.code, item.code), eq(competitions.providerSeason, seasonYear))).limit(1);
  const values = { code: item.code, name: item.name, country: item.country, provider: "API_FOOTBALL", providerLeagueId, providerSeason: seasonYear, coverage: seasonMeta.coverage ?? {}, active: true };
  if (competition) [competition] = await db.update(competitions).set(values).where(eq(competitions.id, competition.id)).returning();
  else [competition] = await db.insert(competitions).values(values).returning();

  const teamResponse = await footballApi.teams(providerLeagueId, seasonYear);
  for (const row of teamResponse) {
    const team = row.team;
    if (!team?.id || !team?.name) continue;
    const existing = await db.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.competitionId, competition.id), eq(clubs.providerTeamId, team.id))).limit(1);
    const clubValues = { competitionId: competition.id, providerTeamId: team.id, name: team.name, shortName: team.code ?? null, logoUrl: team.logo ?? null, active: true };
    if (existing[0]) await db.update(clubs).set(clubValues).where(eq(clubs.id, existing[0].id));
    else await db.insert(clubs).values(clubValues);
  }

  const fixtureResponse = await footballApi.fixtures(providerLeagueId, seasonYear, from, to);
  const clubRows = await db.select().from(clubs).where(eq(clubs.competitionId, competition.id));
  const clubByProviderId = new Map(clubRows.map(c => [c.providerTeamId, c.id]));
  for (const row of fixtureResponse) {
    const homeClubId = clubByProviderId.get(row.teams?.home?.id);
    const awayClubId = clubByProviderId.get(row.teams?.away?.id);
    if (!homeClubId || !awayClubId || !row.fixture?.id || !row.fixture?.date) continue;
    const statusMap: Record<string, "SCHEDULED" | "LIVE" | "HALF_TIME" | "FINISHED" | "POSTPONED" | "CANCELLED" | "ABANDONED"> = {
      NS: "SCHEDULED", TBD: "SCHEDULED", 1H: "LIVE", 2H: "LIVE", ET: "LIVE", P: "LIVE", LIVE: "LIVE", HT: "HALF_TIME", FT: "FINISHED", AET: "FINISHED", PEN: "FINISHED", PST: "POSTPONED", CANC: "CANCELLED", ABD: "ABANDONED",
    };
    const fixtureValues = {
      competitionId: competition.id, seasonId: season.id, providerFixtureId: row.fixture.id,
      homeClubId, awayClubId, kickoffAt: new Date(row.fixture.date),
      status: statusMap[row.fixture.status?.short] ?? "SCHEDULED",
      homeScore: row.goals?.home ?? null, awayScore: row.goals?.away ?? null, rawPayload: row,
      updatedAt: new Date(),
    };
    const existing = await db.select({ id: fixtures.id }).from(fixtures).where(eq(fixtures.providerFixtureId, row.fixture.id)).limit(1);
    if (existing[0]) await db.update(fixtures).set(fixtureValues).where(eq(fixtures.id, existing[0].id));
    else await db.insert(fixtures).values(fixtureValues);
  }
  console.log(`${item.name}: synced ${teamResponse.length} team rows and ${fixtureResponse.length} fixtures (${seasonLabel}).`);
}
