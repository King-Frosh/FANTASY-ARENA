
import { config } from "dotenv";

config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });

import { and, eq } from "drizzle-orm";
import { clubs, competitions } from "../src/db/schema";

const SEASON = 2024;
const PAGE = 3;

async function testPlayerFetch() {
  const [{ db }, { footballApi }] = await Promise.all([
    import("../src/db"),
    import("../src/lib/football-api/client"),
  ]);

  console.log("======================================");
  console.log("   FANTASY ARENA PLAYER FETCH TEST");
  console.log("======================================");
  console.log(`Season: ${SEASON}`);
  console.log(`Page requested: ${PAGE}`);

  // Find one Premier League club from the database.
  const [club] = await db
    .select({
      name: clubs.name,
      providerTeamId: clubs.providerTeamId,
    })
    .from(clubs)
    .innerJoin(
      competitions,
      eq(clubs.competitionId, competitions.id)
    )
    .where(
      and(
        eq(competitions.code, "EPL"),
        eq(competitions.providerSeason, SEASON)
      )
    )
    .limit(1);

  if (!club) {
    throw new Error(
      "No Premier League club found. Run club synchronization first."
    );
  }

  console.log("\n======================================");
  console.log("             TEST CLUB");
  console.log("======================================");
  console.log(`Club: ${club.name}`);
  console.log(`API-Football Team ID: ${club.providerTeamId}`);

  console.log("\nRequesting historical player data...");

  // Retrieve player records together with pagination metadata.
  const pageResult = await footballApi.playersPage(
    club.providerTeamId,
    SEASON,
    PAGE
  );

  const response = pageResult.response;
  const paging = pageResult.paging;

  console.log("\n======================================");
  console.log("          API PAGINATION");
  console.log("======================================");
  console.log(`Current page: ${paging?.current ?? "Unavailable"}`);
  console.log(`Total pages: ${paging?.total ?? "Unavailable"}`);
  console.log(`Total results: ${pageResult.results}`);
  console.log(`Players returned on this page: ${response.length}`);

  if (response.length === 0) {
    console.log("\nNo player records returned for this club.");
    return;
  }

  console.log("\n======================================");
  console.log("        SAMPLE PLAYER RECORDS");
  console.log("======================================");

  for (const item of response.slice(0, 5)) {
    const player = item.player;
    const statistics = item.statistics?.[0];

    console.log("--------------------------------------");
    console.log(`Name: ${player?.name ?? "Unavailable"}`);
    console.log(`Provider ID: ${player?.id ?? "Unavailable"}`);
    console.log(
      `Position: ${statistics?.games?.position ?? "Unavailable"}`
    );
    console.log(
      `Nationality: ${player?.nationality ?? "Unavailable"}`
    );
    console.log(
      `Date of birth: ${player?.birth?.date ?? "Unavailable"}`
    );
    console.log(
      `Photo: ${player?.photo ?? "Unavailable"}`
    );
  }

  console.log("\n======================================");
  console.log("       READ-ONLY TEST COMPLETED");
  console.log("======================================");
  console.log("No database records were inserted or modified.");
}

testPlayerFetch().catch((error) => {
  console.error("\nPlayer fetch test failed:");
  console.error(error);
  process.exitCode = 1;
});
