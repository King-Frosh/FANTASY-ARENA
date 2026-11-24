
import { config } from "dotenv";

config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });

import { and, eq } from "drizzle-orm";
import { clubs, competitions, seasons } from "../src/db/schema";

const seasonYear = Number(process.env.FOOTBALL_SEASON ?? "2024");

const configured = [
  {
    code: "EPL" as const,
    name: "Premier League",
    country: "England",
    leagueId: process.env.API_FOOTBALL_EPL_LEAGUE_ID,
  },
  {
    code: "LALIGA" as const,
    name: "LaLiga",
    country: "Spain",
    leagueId: process.env.API_FOOTBALL_LALIGA_LEAGUE_ID,
  },
];

async function syncFootball() {
  if (!Number.isInteger(seasonYear) || seasonYear < 2000) {
    throw new Error("FOOTBALL_SEASON must be a valid season year.");
  }

  // Load environment-dependent modules only after dotenv configuration.
  const [{ db }, { footballApi }] = await Promise.all([
    import("../src/db"),
    import("../src/lib/football-api/client"),
  ]);

  const seasonLabel = `${seasonYear}-${seasonYear + 1}`;

  console.log("======================================");
  console.log("       FANTASY ARENA CLUB SYNC");
  console.log("======================================");
  console.log(`Development season: ${seasonLabel}`);

  let [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.label, seasonLabel))
    .limit(1);

  if (!season) {
    [season] = await db
      .insert(seasons)
      .values({
        label: seasonLabel,
        isCurrent: true,
      })
      .returning();
  }

  for (const item of configured) {
    console.log(`\nProcessing ${item.name}...`);

    if (!item.leagueId) {
      throw new Error(
        `Missing league ID for ${item.name}. Check your .env.local file.`
      );
    }

    const providerLeagueId = Number(item.leagueId);

    if (!Number.isInteger(providerLeagueId)) {
      throw new Error(`Invalid league ID for ${item.name}.`);
    }

    // Use country + season. Do not combine search + season.
    const candidates = await footballApi.leaguesByCountry(
      item.country,
      seasonYear
    );

    const selected = candidates.find(
      (candidate) =>
        candidate.league.id === providerLeagueId
    );

    if (!selected) {
      throw new Error(
        `${item.name} (ID ${providerLeagueId}) was not returned for ${seasonYear}.`
      );
    }

    const seasonMeta = selected.seasons.find(
      (entry) => entry.year === seasonYear
    );

    if (!seasonMeta) {
      throw new Error(
        `No ${seasonYear} season metadata found for ${item.name}.`
      );
    }

    const competitionValues = {
      code: item.code,
      name: item.name,
      country: item.country,
      provider: "API_FOOTBALL",
      providerLeagueId,
      providerSeason: seasonYear,
      coverage: seasonMeta.coverage ?? {},
      active: true,
    };

    let [competition] = await db
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.code, item.code),
          eq(competitions.providerSeason, seasonYear)
        )
      )
      .limit(1);

    if (competition) {
      [competition] = await db
        .update(competitions)
        .set(competitionValues)
        .where(eq(competitions.id, competition.id))
        .returning();
    } else {
      [competition] = await db
        .insert(competitions)
        .values(competitionValues)
        .returning();
    }

    console.log(`Competition registered: ${item.name}`);
    console.log(`Provider league ID: ${providerLeagueId}`);

    const teamResponse = await footballApi.teams(
      providerLeagueId,
      seasonYear
    );

    let imported = 0;

    for (const row of teamResponse) {
      const team = row.team;

      if (!team?.id || !team?.name) continue;

      const [existing] = await db
        .select({ id: clubs.id })
        .from(clubs)
        .where(
          and(
            eq(clubs.competitionId, competition.id),
            eq(clubs.providerTeamId, team.id)
          )
        )
        .limit(1);

      const clubValues = {
        competitionId: competition.id,
        providerTeamId: team.id,
        name: team.name,
        shortName: team.code ?? null,
        logoUrl: team.logo ?? null,
        active: true,
      };

      if (existing) {
        await db
          .update(clubs)
          .set(clubValues)
          .where(eq(clubs.id, existing.id));
      } else {
        await db.insert(clubs).values(clubValues);
      }

      imported++;
    }

    console.log(`${item.name}: ${imported} clubs synchronized.`);
  }

  console.log("\n======================================");
  console.log("       CLUB SYNC COMPLETED");
  console.log("======================================");
}

syncFootball().catch((error) => {
  console.error("\nFootball synchronization failed:");
  console.error(error);
  process.exitCode = 1;
});
