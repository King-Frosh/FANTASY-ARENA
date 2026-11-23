
import { config } from "dotenv";

config({
  path: process.env.DOTENV_CONFIG_PATH ?? ".env.local",
});

const discoverySeason = Number(
  process.env.FOOTBALL_DISCOVERY_SEASON ?? "2024"
);

const targetSeason = Number(
  process.env.FOOTBALL_SEASON ?? "2026"
);

if (
  !Number.isInteger(discoverySeason) ||
  !Number.isInteger(targetSeason)
) {
  throw new Error("Invalid football season configuration");
}

async function discover() {
  // Import after loading .env.local
  const { footballApi } = await import(
    "../src/lib/football-api/client"
  );

  const competitions = [
    {
      label: "Premier League",
      country: "England",
      expectedName: "premier league",
    },
    {
      label: "LaLiga",
      country: "Spain",
      expectedName: "la liga",
    },
  ];

  console.log("======================================");
  console.log("       FANTASY ARENA DISCOVERY");
  console.log("======================================");
  console.log(`Discovery season: ${discoverySeason}`);
  console.log(`Target season: ${targetSeason}`);
  console.log("");

  for (const competition of competitions) {
    console.log(`Searching for ${competition.label}...`);

    try {
      const candidates = await footballApi.leaguesByCountry(
        competition.country,
        discoverySeason
      );

      const matches = candidates.filter(
        (item) =>
          item.league.name.trim().toLowerCase() ===
          competition.expectedName
      );

      if (matches.length === 0) {
        console.log(
          `No exact match found for ${competition.label}.`
        );

        console.log(
          "Available league names:",
          candidates.map((item) => item.league.name)
        );

        continue;
      }

      for (const item of matches) {
        const seasonInfo = item.seasons?.find(
          (season) => season.year === discoverySeason
        );

        console.log(
          JSON.stringify(
            {
              competition: competition.label,
              leagueId: item.league.id,
              leagueName: item.league.name,
              country: item.country.name,
              season: seasonInfo?.year,
              start: seasonInfo?.start,
              end: seasonInfo?.end,
              current: seasonInfo?.current,
              coverage: seasonInfo?.coverage,
            },
            null,
            2
          )
        );
      }
    } catch (error) {
      console.error(
        `Error discovering ${competition.label}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("");
  console.log("======================================");
  console.log("DISCOVERY COMPLETED");
  console.log("======================================");
  console.log(
    `Target season remains ${targetSeason}/${targetSeason + 1}.`
  );
}

discover().catch((error) => {
  console.error("Discovery failed:", error);
  process.exitCode = 1;
});
