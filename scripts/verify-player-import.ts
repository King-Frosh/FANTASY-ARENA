
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const EXPECTED_SEASON = "2024-2025";
const EXPECTED_PROVIDER_SEASON = 2024;

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Check your .env.local file.");
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await client.connect();

    console.log("\n==============================================");
    console.log("    FANTASY ARENA SEASON DATA VERIFICATION");
    console.log("==============================================\n");

    // 1. Verify season record
    const seasonResult = await client.query(
      `
      SELECT id, label, starts_at, ends_at, is_current
      FROM seasons
      WHERE label = $1
      `,
      [EXPECTED_SEASON]
    );

    console.log("2024/25 SEASON RECORD");
    console.log("----------------------------------------------");
    console.table(seasonResult.rows);

    if (seasonResult.rows.length !== 1) {
      throw new Error(
        `Expected exactly one ${EXPECTED_SEASON} season record; found ${seasonResult.rows.length}.`
      );
    }

    const seasonId = seasonResult.rows[0].id;

    // 2. Verify competition records
    const competitionResult = await client.query(
      `
      SELECT id, code, name, country, provider, provider_league_id,
             provider_season, active
      FROM competitions
      WHERE code IN ('EPL', 'LALIGA')
        AND provider_season = $1
      ORDER BY code
      `,
      [EXPECTED_PROVIDER_SEASON]
    );

    console.log("\n2024 COMPETITION RECORDS");
    console.log("----------------------------------------------");
    console.table(competitionResult.rows);

    const competitionCodes = new Set(
      competitionResult.rows.map((row) => row.code)
    );

    const competitionsValid =
      competitionResult.rows.length === 2 &&
      competitionCodes.has("EPL") &&
      competitionCodes.has("LALIGA");

    // 3. Registrations for the expected season
    const seasonRegistrationResult = await client.query(
      `
      SELECT
        COUNT(*)::int AS total_registrations,
        COUNT(DISTINCT pr.player_id)::int AS unique_players,
        COUNT(DISTINCT pr.club_id)::int AS unique_clubs
      FROM player_registrations pr
      WHERE pr.season_id = $1
      `,
      [seasonId]
    );

    console.log("\nREGISTRATIONS IN 2024/25 SEASON");
    console.log("----------------------------------------------");
    console.table(seasonRegistrationResult.rows);

    // 4. Registrations grouped by competition and club
    const clubResult = await client.query(
      `
      SELECT
        co.code AS competition,
        c.name AS club,
        COUNT(pr.id)::int AS registrations,
        COUNT(DISTINCT pr.player_id)::int AS unique_players
      FROM player_registrations pr
      INNER JOIN clubs c ON c.id = pr.club_id
      INNER JOIN competitions co ON co.id = c.competition_id
      WHERE pr.season_id = $1
      GROUP BY co.code, c.name
      ORDER BY co.code, c.name
      `,
      [seasonId]
    );

    console.log("\n2024/25 REGISTRATIONS BY CLUB");
    console.log("----------------------------------------------");
    console.table(clubResult.rows);

    // 5. Check clubs assigned to the expected competitions
    const clubCompetitionResult = await client.query(
      `
      SELECT
        co.code AS competition,
        COUNT(c.id)::int AS club_count
      FROM clubs c
      INNER JOIN competitions co ON co.id = c.competition_id
      WHERE co.provider_season = $1
        AND co.code IN ('EPL', 'LALIGA')
      GROUP BY co.code
      ORDER BY co.code
      `,
      [EXPECTED_PROVIDER_SEASON]
    );

    console.log("\nCLUBS BY COMPETITION");
    console.log("----------------------------------------------");
    console.table(clubCompetitionResult.rows);

    // 6. Check registrations outside the expected season
    const otherSeasonResult = await client.query(
      `
      SELECT
        s.label AS season,
        COUNT(pr.id)::int AS registrations
      FROM player_registrations pr
      INNER JOIN seasons s ON s.id = pr.season_id
      WHERE pr.season_id <> $1
      GROUP BY s.label
      ORDER BY s.label
      `,
      [seasonId]
    );

    console.log("\nREGISTRATIONS IN OTHER SEASONS");
    console.log("----------------------------------------------");

    if (otherSeasonResult.rows.length === 0) {
      console.log("No registrations found in other seasons.");
    } else {
      console.table(otherSeasonResult.rows);
    }

    // 7. Duplicate player profiles
    const duplicatePlayersResult = await client.query(`
      SELECT provider_player_id, COUNT(*)::int AS occurrences
      FROM players
      GROUP BY provider_player_id
      HAVING COUNT(*) > 1
    `);

    // 8. Duplicate registrations
    const duplicateRegistrationsResult = await client.query(`
      SELECT player_id, club_id, season_id,
             COUNT(*)::int AS occurrences
      FROM player_registrations
      GROUP BY player_id, club_id, season_id
      HAVING COUNT(*) > 1
    `);

    console.log("\nDUPLICATE CHECKS");
    console.log("----------------------------------------------");
    console.log(
      `Duplicate player profiles: ${duplicatePlayersResult.rows.length}`
    );
    console.log(
      `Duplicate registrations: ${duplicateRegistrationsResult.rows.length}`
    );

    // 9. Final verification summary
    const seasonRegistrations =
      seasonRegistrationResult.rows[0].total_registrations;

    const seasonPlayers = seasonRegistrationResult.rows[0].unique_players;

    const seasonClubs = seasonRegistrationResult.rows[0].unique_clubs;

    console.log("\nFINAL VERIFICATION");
    console.log("----------------------------------------------");
    console.log(
      `2024/25 season exists: ${seasonResult.rows.length === 1 ? "PASSED" : "FAILED"}`
    );
    console.log(
      `EPL and LaLiga competition records: ${competitionsValid ? "PASSED" : "CHECK REQUIRED"}`
    );
    console.log(
      `479 registrations in 2024/25: ${seasonRegistrations === 479 ? "PASSED" : "CHECK REQUIRED"}`
    );
    console.log(
      `467 unique players in 2024/25: ${seasonPlayers === 467 ? "PASSED" : "CHECK REQUIRED"}`
    );
    console.log(
      `9 clubs with registrations: ${seasonClubs === 9 ? "PASSED" : "CHECK REQUIRED"}`
    );
    console.log(
      `No duplicate player profiles: ${duplicatePlayersResult.rows.length === 0 ? "PASSED" : "FAILED"}`
    );
    console.log(
      `No duplicate registrations: ${duplicateRegistrationsResult.rows.length === 0 ? "PASSED" : "FAILED"}`
    );

    console.log("\n==============================================");
    console.log("       VERIFICATION FINISHED");
    console.log("==============================================\n");
  } catch (error) {
    console.error("\nSEASON VERIFICATION FAILED:");

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
