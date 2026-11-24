
import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });

import fs from "node:fs/promises";
import path from "node:path";

const SEASON = Number(process.env.FOOTBALL_SEASON ?? "2024");
const SEASON_LABEL = `${SEASON}-${SEASON + 1}`;

const MAX_API_PAGE = 3;

// 7 seconds between requests to respect the 10 requests/minute limit.
const REQUEST_DELAY_MS = 7000;

const CACHE_DIRECTORY = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(
  CACHE_DIRECTORY,
  `football-players-${SEASON}.json`,
);

type CompetitionCode = "EPL" | "LALIGA";
type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";

type ApiPlayerRow = {
  player: {
    id: number;
    name: string;
    photo?: string | null;
    birth?: {
      date?: string | null;
    } | null;
    nationality?: string | null;
  };
  statistics?: Array<{
    team?: {
      id?: number;
    };
    games?: {
      position?: string | null;
    };
  }>;
};

type ApiPlayerPage = {
  response: ApiPlayerRow[];
  paging?: {
    current: number;
    total: number;
  };
};

type CachedPage = {
  season: number;
  teamId: number;
  page: number;
  totalPages: number;
  response: ApiPlayerRow[];
  savedAt: string;
};

type PlayerRegistration = {
  providerPlayerId: number;
  fullName: string;
  photoUrl: string | null;
  dateOfBirth: Date | null;
  nationality: string | null;
  position: FantasyPosition;
  clubId: string;
};

type PreparedProfile = {
  providerPlayerId: number;
  fullName: string;
  photoUrl: string | null;
  dateOfBirth: Date | null;
  nationality: string | null;
};

type ClubImportResult = {
  clubName: string;
  teamId: number;
  pagesReported: number;
  pagesFetched: number;
  playersFound: number;
  complete: boolean;
  source: "CACHE" | "API" | "MIXED";
};

type ImportOptions = {
  competition: CompetitionCode | "ALL";
  apply: boolean;
  applyPartial: boolean;
  refreshCache: boolean;
  coverage: boolean;
  discover: boolean;
  recoverMissing: boolean;
  maxRequests?: number;
  teamId?: number;
};

type FootballApiClient = {
  playersPage: (
    team: number,
    season: number,
    page: number,
  ) => Promise<ApiPlayerPage>;
};

type RequestCounter = {
  count: number;
  maxRequests?: number;
};

class RequestLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestLimitError";
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function parseArguments(): ImportOptions {
  const args = process.argv.slice(2);

  let competition: CompetitionCode | "ALL" = "ALL";
  let apply = false;
  let applyPartial = false;
  let refreshCache = false;
  let coverage = false;
  let discover = false;
  let recoverMissing = false;
  let maxRequests: number | undefined;
  let teamId: number | undefined;

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === "--apply") {
      apply = true;
      continue;
    }

    if (argument === "--apply-partial") {
      applyPartial = true;
      continue;
    }

    if (argument === "--refresh-cache") {
      refreshCache = true;
      continue;
    }

    if (argument === "--coverage") {
      coverage = true;
      continue;
    }

    if (argument === "--discover") {
      discover = true;
      continue;
    }

    if (argument === "--recover-missing") {
      recoverMissing = true;
      continue;
    }

    if (argument === "--competition") {
      const value = args[index + 1]?.toUpperCase();

      if (!value || !["EPL", "LALIGA", "ALL"].includes(value)) {
        throw new Error(
          "Invalid competition. Use --competition EPL, LALIGA, or ALL.",
        );
      }

      competition = value as CompetitionCode | "ALL";
      index++;
      continue;
    }

    if (argument === "--team") {
      const value = Number(args[index + 1]);

      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("--team requires a valid API-Football team ID.");
      }

      teamId = value;
      index++;
      continue;
    }

    if (argument === "--max-requests") {
      const value = Number(args[index + 1]);

      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
          "--max-requests requires a positive whole number.",
        );
      }

      maxRequests = value;
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (discover && maxRequests === undefined) {
    throw new Error(
      "Discovery mode requires an explicit request limit. " +
        "Example: --discover --max-requests 5",
    );
  }

  if (recoverMissing && maxRequests === undefined) {
    throw new Error(
      "Missing-page recovery requires an explicit request limit. " +
        "Example: --recover-missing --max-requests 4",
    );
  }

  if (recoverMissing && discover) {
    throw new Error(
      "--recover-missing cannot be combined with --discover.",
    );
  }

  if (recoverMissing && apply) {
    throw new Error(
      "--recover-missing cannot be combined with --apply.",
    );
  }

  if (recoverMissing && applyPartial) {
    throw new Error(
      "--recover-missing cannot be combined with --apply-partial.",
    );
  }

  if (recoverMissing && coverage) {
    throw new Error(
      "--recover-missing cannot be combined with --coverage.",
    );
  }

  if (recoverMissing && refreshCache) {
    throw new Error(
      "--recover-missing cannot be combined with --refresh-cache.",
    );
  }

  if (discover && apply) {
    throw new Error("--discover cannot be combined with --apply.");
  }

  if (discover && applyPartial) {
    throw new Error(
      "--discover cannot be combined with --apply-partial.",
    );
  }

  if (discover && refreshCache) {
    throw new Error(
      "--discover cannot be combined with --refresh-cache.",
    );
  }

  if (discover && coverage) {
    throw new Error(
      "--discover cannot be combined with --coverage.",
    );
  }

  if (!discover && !recoverMissing && maxRequests !== undefined) {
    throw new Error(
      "--max-requests can only be used with --discover " +
        "or --recover-missing.",
    );
  }

  if (coverage && apply) {
    throw new Error("--coverage cannot be combined with --apply.");
  }

  if (coverage && applyPartial) {
    throw new Error(
      "--coverage cannot be combined with --apply-partial.",
    );
  }

  if (coverage && refreshCache) {
    throw new Error(
      "--coverage cannot be combined with --refresh-cache.",
    );
  }

  if (apply && applyPartial) {
    throw new Error(
      "Use either --apply or --apply-partial, not both.",
    );
  }

  if (applyPartial && refreshCache) {
    throw new Error(
      "--apply-partial cannot be combined with --refresh-cache.",
    );
  }

  if (applyPartial && discover) {
    throw new Error(
      "--apply-partial cannot be combined with --discover.",
    );
  }

  return {
    competition,
    apply,
    applyPartial,
    refreshCache,
    coverage,
    discover,
    recoverMissing,
    maxRequests,
    teamId,
  };
}

function mapPosition(position?: string | null): FantasyPosition {
  const normalized = position?.trim().toLowerCase();

  switch (normalized) {
    case "goalkeeper":
      return "GK";
    case "defender":
      return "DEF";
    case "midfielder":
      return "MID";
    case "attacker":
    case "forward":
      return "FWD";
    default:
      throw new Error(
        `Unsupported player position: ${position ?? "missing"}`,
      );
  }
}

function validDate(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getPositionForClub(
  player: ApiPlayerRow,
  teamId: number,
): FantasyPosition | null {
  const statistics = player.statistics ?? [];

  const matchingStatistic = statistics.find(
    (statistic) => Number(statistic.team?.id) === teamId,
  );

  const position =
    matchingStatistic?.games?.position ??
    statistics[0]?.games?.position;

  if (!position) return null;

  try {
    return mapPosition(position);
  } catch {
    return null;
  }
}

function cacheKey(teamId: number, page: number): string {
  return `${SEASON}:${teamId}:${page}`;
}

async function loadCache(): Promise<Map<string, CachedPage>> {
  await fs.mkdir(CACHE_DIRECTORY, { recursive: true });

  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CachedPage[];

    const cache = new Map<string, CachedPage>();

    for (const entry of parsed) {
      if (
        entry.season === SEASON &&
        Number.isInteger(entry.teamId) &&
        Number.isInteger(entry.page) &&
        Array.isArray(entry.response)
      ) {
        cache.set(cacheKey(entry.teamId, entry.page), entry);
      }
    }

    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Map();
    }

    throw new Error(
      `Unable to read player cache: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function saveCache(
  cache: Map<string, CachedPage>,
): Promise<void> {
  await fs.mkdir(CACHE_DIRECTORY, { recursive: true });

  const temporaryFile = `${CACHE_FILE}.tmp`;

  await fs.writeFile(
    temporaryFile,
    JSON.stringify(Array.from(cache.values()), null, 2),
    "utf8",
  );

  await fs.rename(temporaryFile, CACHE_FILE);
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;

    if (typeof status === "number") return status;
  }

  return undefined;
}

// Every actual API attempt is counted.
// No request can be made after the configured limit is reached.
async function fetchPlayerPage(
  footballApi: FootballApiClient,
  teamId: number,
  page: number,
  requestCounter: RequestCounter,
): Promise<ApiPlayerPage> {
  if (
    requestCounter.maxRequests !== undefined &&
    requestCounter.count >= requestCounter.maxRequests
  ) {
    throw new RequestLimitError(
      `Request limit reached (${requestCounter.maxRequests}).`,
    );
  }

  requestCounter.count++;

  console.log(
    `API request ${requestCounter.count}` +
      (requestCounter.maxRequests
        ? `/${requestCounter.maxRequests}`
        : "") +
      `: team ${teamId}, page ${page}`,
  );

  await sleep(REQUEST_DELAY_MS);

  try {
    return await footballApi.playersPage(teamId, SEASON, page);
  } catch (error) {
    if (getHttpStatus(error) === 429) {
      throw new Error(
        `HTTP 429: API-Football rate limit reached. ` +
          `The importer stopped immediately. ` +
          `${requestCounter.count} request(s) attempted. ` +
          `Successful cached pages have been preserved. ` +
          `Wait before making further API requests.`,
      );
    }

    throw error;
  }
}

async function getPlayerPage(
  footballApi: FootballApiClient,
  teamId: number,
  page: number,
  cache: Map<string, CachedPage>,
  requestCounter: RequestCounter,
  refreshCache: boolean,
): Promise<{
  data: ApiPlayerRow[];
  totalPages: number;
  source: "CACHE" | "API";
}> {
  const key = cacheKey(teamId, page);
  const cached = cache.get(key);

  if (!refreshCache && cached) {
    return {
      data: cached.response,
      totalPages: cached.totalPages,
      source: "CACHE",
    };
  }

  const result = await fetchPlayerPage(
    footballApi,
    teamId,
    page,
    requestCounter,
  );

  const totalPages = Math.max(
    1,
    Number(result.paging?.total ?? 1),
  );

  cache.set(key, {
    season: SEASON,
    teamId,
    page,
    totalPages,
    response: result.response,
    savedAt: new Date().toISOString(),
  });

  await saveCache(cache);

  return {
    data: result.response,
    totalPages,
    source: "API",
  };
}

async function runDiscovery(
  footballApi: FootballApiClient,
  db: any,
  schema: any,
  drizzle: any,
  options: ImportOptions,
  cache: Map<string, CachedPage>,
  requestCounter: RequestCounter,
): Promise<void> {
  const { eq, and, asc } = drizzle;
  const { competitions, clubs } = schema;

  console.log("");
  console.log("==============================================");
  console.log("       CONTROLLED PLAYER DISCOVERY");
  console.log("==============================================");
  console.log(`Season: ${SEASON_LABEL}`);
  console.log(`Competition: ${options.competition}`);
  console.log(`Maximum API requests: ${options.maxRequests}`);
  console.log(`Request interval: ${REQUEST_DELAY_MS}ms`);
  console.log("Fetch mode: PAGE 1 ONLY");
  console.log("Database writes: DISABLED");
  console.log("==============================================");

  const competitionCodes: CompetitionCode[] =
    options.competition === "ALL"
      ? ["EPL", "LALIGA"]
      : [options.competition];

  let clubsExamined = 0;
  let clubsSkipped = 0;
  let successfulRequests = 0;
  let failedRequests = 0;

  const discovered: Array<{
    competition: string;
    club: string;
    teamId: number;
    pagesReported: number;
    playersReturned: number;
    status: string;
  }> = [];

  for (const competitionCode of competitionCodes) {
    if (
      requestCounter.count >=
      (requestCounter.maxRequests ?? 0)
    ) {
      break;
    }

    console.log("");
    console.log("----------------------------------------------");
    console.log(`DISCOVERING: ${competitionCode}`);
    console.log("----------------------------------------------");

    const [competition] = await db
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.code, competitionCode),
          eq(competitions.providerSeason, SEASON),
        ),
      )
      .limit(1);

    if (!competition) {
      throw new Error(
        `${competitionCode} for ${SEASON} was not found. ` +
          "Run football:sync first.",
      );
    }

    const competitionClubs = await db
      .select()
      .from(clubs)
      .where(eq(clubs.competitionId, competition.id))
      .orderBy(asc(clubs.name));

    const selectedClubs = options.teamId
      ? competitionClubs.filter(
          (club: any) =>
            Number(club.providerTeamId) === options.teamId,
        )
      : competitionClubs;

    if (options.teamId && selectedClubs.length === 0) {
      throw new Error(
        `Team ID ${options.teamId} was not found in ${competitionCode}.`,
      );
    }

    for (const club of selectedClubs) {
      if (
        requestCounter.count >=
        (requestCounter.maxRequests ?? 0)
      ) {
        console.log("");
        console.log("REQUEST LIMIT REACHED. Discovery stopped safely.");
        break;
      }

      clubsExamined++;

      const teamId = Number(club.providerTeamId);

      if (!Number.isInteger(teamId) || teamId <= 0) {
        clubsSkipped++;

        console.log(
          `Skipping ${club.name}: invalid API team ID.`,
        );
        continue;
      }

      const existingPageOne = cache.get(cacheKey(teamId, 1));

      if (existingPageOne) {
        clubsSkipped++;

        console.log(
          `Skipping ${club.name} (${teamId}): page 1 already cached.`,
        );
        continue;
      }

      console.log("");
      console.log(
        `Discovering ${club.name} (API ID: ${teamId})`,
      );

      try {
        const result = await getPlayerPage(
          footballApi,
          teamId,
          1,
          cache,
          requestCounter,
          false,
        );

        successfulRequests++;

        const playersReturned = result.data.length;

        const status =
          result.totalPages > MAX_API_PAGE
            ? "PLAN-LIMITED"
            : "PAGE 1 DISCOVERED";

        discovered.push({
          competition: competitionCode,
          club: club.name,
          teamId,
          pagesReported: result.totalPages,
          playersReturned,
          status,
        });

        console.log(
          `SUCCESS: ${club.name} | ` +
            `Pages reported: ${result.totalPages} | ` +
            `Players on page 1: ${playersReturned}`,
        );

        console.log("Page 1 saved to cache.");
      } catch (error) {
        failedRequests++;

        console.error(
          `Discovery failed for ${club.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        if (
          error instanceof RequestLimitError ||
          getHttpStatus(error) === 429 ||
          (error instanceof Error &&
            error.message.includes("HTTP 429"))
        ) {
          console.log(
            "Stopping discovery to protect the remaining API quota.",
          );
          break;
        }
      }
    }
  }

  console.log("");
  console.log("==============================================");
  console.log("           DISCOVERY SUMMARY");
  console.log("==============================================");

  console.table(discovered);

  console.log(`Clubs examined: ${clubsExamined}`);
  console.log(`Clubs skipped: ${clubsSkipped}`);
  console.log(`Successful page 1 requests: ${successfulRequests}`);
  console.log(`Failed requests: ${failedRequests}`);
  console.log(`Total API attempts: ${requestCounter.count}`);
  console.log(`Maximum allowed requests: ${requestCounter.maxRequests}`);
  console.log(`Cached pages now available: ${cache.size}`);

  console.log("");
  console.log("DATABASE WRITES: 0");
  console.log("PLAYER IMPORT: NOT PERFORMED");
  console.log("DISCOVERY COMPLETED.");
}

// =============================================================
// SAFE MISSING-PAGE RECOVERY
// =============================================================
//
// This mode only recovers missing pages for clubs that:
// 1. Already have a cached page 1.
// 2. Have no more than MAX_API_PAGE pages reported.
// 3. Have valid cached page metadata.
//
// Existing cached pages are never overwritten.
// Every successful recovered page is saved immediately.
// This mode never writes to the database.

async function runMissingPageRecovery(
  footballApi: FootballApiClient,
  db: any,
  schema: any,
  drizzle: any,
  options: ImportOptions,
  cache: Map<string, CachedPage>,
  requestCounter: RequestCounter,
): Promise<void> {
  const { eq, and, asc } = drizzle;
  const { competitions, clubs } = schema;

  const competitionCodes: CompetitionCode[] =
    options.competition === "ALL"
      ? ["EPL", "LALIGA"]
      : [options.competition];

  let clubsExamined = 0;
  let clubsSkipped = 0;
  let pagesAlreadyCached = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let stoppedByError = false;

  const recovered: Array<{
    competition: string;
    club: string;
    teamId: number;
    page: number;
    players: number;
    status: string;
  }> = [];

  console.log("");
  console.log("==============================================");
  console.log("       SAFE MISSING-PAGE RECOVERY");
  console.log("==============================================");
  console.log(`Season: ${SEASON_LABEL}`);
  console.log(`Competition: ${options.competition}`);
  console.log(`Maximum API requests: ${options.maxRequests}`);
  console.log(`Request interval: ${REQUEST_DELAY_MS}ms`);
  console.log("Existing cached pages: PRESERVED");
  console.log("Missing pages only: ENABLED");
  console.log("Database writes: DISABLED");
  console.log("Player import: DISABLED");
  console.log("==============================================");

  for (const competitionCode of competitionCodes) {
    if (
      requestCounter.count >=
      (requestCounter.maxRequests ?? 0)
    ) {
      break;
    }

    if (stoppedByError) break;

    console.log("");
    console.log("----------------------------------------------");
    console.log(`RECOVERING: ${competitionCode}`);
    console.log("----------------------------------------------");

    const [competition] = await db
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.code, competitionCode),
          eq(competitions.providerSeason, SEASON),
        ),
      )
      .limit(1);

    if (!competition) {
      throw new Error(
        `${competitionCode} for ${SEASON} was not found. ` +
          "Run football:sync first.",
      );
    }

    const competitionClubs = await db
      .select()
      .from(clubs)
      .where(eq(clubs.competitionId, competition.id))
      .orderBy(asc(clubs.name));

    const selectedClubs = options.teamId
      ? competitionClubs.filter(
          (club: any) =>
            Number(club.providerTeamId) === options.teamId,
        )
      : competitionClubs;

    if (options.teamId && selectedClubs.length === 0) {
      // With ALL competitions, the requested team may belong
      // to the other competition. Only fail if neither has it.
      if (options.competition !== "ALL") {
        throw new Error(
          `Team ID ${options.teamId} was not found in ${competitionCode}.`,
        );
      }

      continue;
    }

    for (const club of selectedClubs) {
      if (stoppedByError) break;

      if (
        requestCounter.count >=
        (requestCounter.maxRequests ?? 0)
      ) {
        console.log("");
        console.log("REQUEST LIMIT REACHED. Recovery stopped safely.");
        break;
      }

      clubsExamined++;

      const teamId = Number(club.providerTeamId);

      if (!Number.isInteger(teamId) || teamId <= 0) {
        clubsSkipped++;

        console.log(
          `Skipping ${club.name}: invalid API team ID.`,
        );
        continue;
      }

      const firstPage = cache.get(cacheKey(teamId, 1));

      if (!firstPage) {
        clubsSkipped++;

        console.log(
          `Skipping ${club.name} (${teamId}): page 1 is not cached.`,
        );
        continue;
      }

      const reportedPages = Number(firstPage.totalPages);

      if (
        !Number.isInteger(reportedPages) ||
        reportedPages < 1
      ) {
        clubsSkipped++;

        console.log(
          `Skipping ${club.name}: invalid page count in cached page 1.`,
        );
        continue;
      }

      if (reportedPages > MAX_API_PAGE) {
        clubsSkipped++;

        console.log(
          `Skipping ${club.name}: API plan limit ` +
            `(${reportedPages} pages reported; maximum ${MAX_API_PAGE}).`,
        );
        continue;
      }

      if (reportedPages === 1) {
        console.log(
          `Skipping ${club.name}: all reported pages are already accounted for.`,
        );
        continue;
      }

      console.log("");
      console.log(
        `Checking ${club.name} (API ID: ${teamId})`,
      );

      for (let page = 2; page <= reportedPages; page++) {
        if (
          requestCounter.count >=
          (requestCounter.maxRequests ?? 0)
        ) {
          console.log("Request limit reached. Recovery stopped.");
          break;
        }

        const key = cacheKey(teamId, page);

        if (cache.has(key)) {
          pagesAlreadyCached++;

          console.log(
            `Page ${page}: already cached. Skipping API request.`,
          );

          continue;
        }

        console.log(
          `Recovering ${club.name}: page ${page}/${reportedPages}`,
        );

        try {
          const result = await fetchPlayerPage(
            footballApi,
            teamId,
            page,
            requestCounter,
          );

          const actualTotalPages = Number(
            result.paging?.total ?? 0,
          );

          if (
            !Array.isArray(result.response) ||
            !Number.isInteger(actualTotalPages) ||
            actualTotalPages < 1
          ) {
            throw new Error(
              `Invalid API response for ${club.name}, page ${page}. ` +
                "The page was not saved.",
            );
          }

          if (actualTotalPages !== reportedPages) {
            throw new Error(
              `Page-count mismatch for ${club.name}. ` +
                `Cached page 1 reports ${reportedPages}, ` +
                `but page ${page} reports ${actualTotalPages}. ` +
                "The page was not saved.",
            );
          }

          const cachedPage: CachedPage = {
            season: SEASON,
            teamId,
            page,
            totalPages: actualTotalPages,
            response: result.response,
            savedAt: new Date().toISOString(),
          };

          // Preserve the original cache entry if saving fails.
          const previousEntry = cache.get(key);

          cache.set(key, cachedPage);

          try {
            await saveCache(cache);
          } catch (saveError) {
            if (previousEntry) {
              cache.set(key, previousEntry);
            } else {
              cache.delete(key);
            }

            throw saveError;
          }

          successfulRequests++;

          recovered.push({
            competition: competitionCode,
            club: club.name,
            teamId,
            page,
            players: result.response.length,
            status: "RECOVERED AND SAVED",
          });

          console.log(
            `SUCCESS: ${club.name} page ${page} | ` +
              `Players: ${result.response.length}`,
          );

          console.log("Page saved to cache immediately.");
        } catch (error) {
          failedRequests++;
          stoppedByError = true;

          console.error(
            `Recovery failed for ${club.name}, page ${page}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );

          console.log(
            "Recovery stopped to protect the remaining API quota.",
          );

          break;
        }
      }
    }
  }

  console.log("");
  console.log("==============================================");
  console.log("       MISSING-PAGE RECOVERY SUMMARY");
  console.log("==============================================");

  console.log("");
  console.log("SUCCESSFULLY RECOVERED PAGES");
  console.table(recovered);

  console.log("");
  console.log(`Clubs examined: ${clubsExamined}`);
  console.log(`Clubs skipped: ${clubsSkipped}`);
  console.log(`Pages already cached: ${pagesAlreadyCached}`);
  console.log(`Successfully recovered pages: ${successfulRequests}`);
  console.log(`Failed requests: ${failedRequests}`);
  console.log(`Total API attempts: ${requestCounter.count}`);
  console.log(`Maximum allowed requests: ${requestCounter.maxRequests}`);
  console.log(`Cached pages now available: ${cache.size}`);

  console.log("");
  console.log("DATABASE WRITES: 0");
  console.log("PLAYER RECORDS CHANGED: 0");
  console.log("EXISTING CACHE PAGES OVERWRITTEN: 0");

  if (stoppedByError) {
    console.log("RECOVERY STATUS: STOPPED AFTER ERROR");
  } else if (
    requestCounter.count >= (requestCounter.maxRequests ?? 0)
  ) {
    console.log("RECOVERY STATUS: REQUEST LIMIT REACHED");
  } else {
    console.log("RECOVERY STATUS: COMPLETED");
  }

  console.log("");
  console.log("Successful pages have been preserved in the local cache.");
}

// =============================================================
// SAFE PARTIAL IMPORT
// =============================================================
//
// This mode is deliberately cache-only.
// It never calls the API and never downloads missing pages.
//
// A club is eligible only when:
// 1. Page 1 exists in the cache.
// 2. The API reported no more than MAX_API_PAGE pages.
// 3. Every page reported by the API is already cached.
//
// Incomplete and plan-limited clubs are skipped entirely.
// Existing registrations are never deleted or deactivated.

async function runPartialApply(
  db: any,
  schema: any,
  drizzle: any,
  options: ImportOptions,
  cache: Map<string, CachedPage>,
  seasonRow: any,
): Promise<void> {
  const {
    competitions,
    clubs,
    players,
    playerRegistrations,
    providerSyncRuns,
  } = schema;

  const competitionCodes: CompetitionCode[] =
    options.competition === "ALL"
      ? ["EPL", "LALIGA"]
      : [options.competition];

  const preparedProfiles = new Map<number, PreparedProfile>();

  const preparedRegistrations = new Map<
    string,
    PlayerRegistration
  >();

  const importedClubs: Array<{
    competition: string;
    club: string;
    teamId: number;
    pages: string;
    players: number;
  }> = [];

  const skippedClubs: Array<{
    competition: string;
    club: string;
    teamId: number | string;
    reason: string;
  }> = [];

  console.log("");
  console.log("==============================================");
  console.log("          SAFE PARTIAL PLAYER IMPORT");
  console.log("==============================================");
  console.log(`Season: ${SEASON_LABEL}`);
  console.log(`Competition: ${options.competition}`);
  console.log("Data source: LOCAL CACHE ONLY");
  console.log("API requests: DISABLED");
  console.log("Cache modification: DISABLED");
  console.log("Incomplete clubs: WILL BE SKIPPED");
  console.log("Existing registrations: WILL BE PRESERVED");
  console.log("==============================================");

  for (const competitionCode of competitionCodes) {
    console.log("");
    console.log("----------------------------------------------");
    console.log(`COMPETITION: ${competitionCode}`);
    console.log("----------------------------------------------");

    const [competition] = await db
      .select()
      .from(competitions)
      .where(
        drizzle.and(
          drizzle.eq(competitions.code, competitionCode),
          drizzle.eq(competitions.providerSeason, SEASON),
        ),
      )
      .limit(1);

    if (!competition) {
      throw new Error(
        `${competitionCode} for ${SEASON} was not found. Run football:sync first.`,
      );
    }

    const competitionClubs = await db
      .select()
      .from(clubs)
      .where(drizzle.eq(clubs.competitionId, competition.id))
      .orderBy(drizzle.asc(clubs.name));

    const selectedClubs = options.teamId
      ? competitionClubs.filter(
          (club: any) =>
            Number(club.providerTeamId) === options.teamId,
        )
      : competitionClubs;

    if (options.teamId && selectedClubs.length === 0) {
      throw new Error(
        `Team ID ${options.teamId} was not found in ${competitionCode}.`,
      );
    }

    for (const club of selectedClubs) {
      const teamId = Number(club.providerTeamId);

      if (!Number.isInteger(teamId) || teamId <= 0) {
        skippedClubs.push({
          competition: competitionCode,
          club: club.name,
          teamId: "INVALID",
          reason: "INVALID TEAM ID",
        });

        continue;
      }

      const firstPage = cache.get(cacheKey(teamId, 1));

      if (!firstPage) {
        skippedClubs.push({
          competition: competitionCode,
          club: club.name,
          teamId,
          reason: "NO CACHED PAGE 1",
        });

        continue;
      }

      const reportedPages = Math.max(
        1,
        Number(firstPage.totalPages || 1),
      );

      if (reportedPages > MAX_API_PAGE) {
        skippedClubs.push({
          competition: competitionCode,
          club: club.name,
          teamId,
          reason: `API PLAN LIMIT (${reportedPages} PAGES REPORTED)`,
        });

        continue;
      }

      const cachedClubPages: CachedPage[] = [];
      let missingPage: number | undefined;

      for (let page = 1; page <= reportedPages; page++) {
        const cachedPage = cache.get(cacheKey(teamId, page));

        if (!cachedPage) {
          missingPage = page;
          break;
        }

        if (!Array.isArray(cachedPage.response)) {
          missingPage = page;
          break;
        }

        cachedClubPages.push(cachedPage);
      }

      if (missingPage !== undefined) {
        skippedClubs.push({
          competition: competitionCode,
          club: club.name,
          teamId,
          reason: `MISSING CACHED PAGE ${missingPage}`,
        });

        continue;
      }

      const clubPlayers = new Map<number, PlayerRegistration>();

      for (const cachedPage of cachedClubPages) {
        for (const row of cachedPage.response) {
          const player = row.player;

          if (
            !player ||
            !Number.isInteger(Number(player.id)) ||
            !player.name
          ) {
            continue;
          }

          const position = getPositionForClub(row, teamId);

          if (!position) {
            console.warn(
              `Skipping ${player.name} at ${club.name}: position unavailable.`,
            );
            continue;
          }

          const providerPlayerId = Number(player.id);

          const registration: PlayerRegistration = {
            providerPlayerId,
            fullName: player.name,
            photoUrl: player.photo ?? null,
            dateOfBirth: validDate(player.birth?.date),
            nationality: player.nationality ?? null,
            position,
            clubId: club.id,
          };

          clubPlayers.set(providerPlayerId, registration);

          if (!preparedProfiles.has(providerPlayerId)) {
            preparedProfiles.set(providerPlayerId, {
              providerPlayerId,
              fullName: registration.fullName,
              photoUrl: registration.photoUrl,
              dateOfBirth: registration.dateOfBirth,
              nationality: registration.nationality,
            });
          }

          preparedRegistrations.set(
            `${providerPlayerId}:${club.id}`,
            registration,
          );
        }
      }

      importedClubs.push({
        competition: competitionCode,
        club: club.name,
        teamId,
        pages: `${cachedClubPages.length}/${reportedPages}`,
        players: clubPlayers.size,
      });

      console.log(
        `ELIGIBLE: ${club.name} | ` +
          `Pages: ${cachedClubPages.length}/${reportedPages} | ` +
          `Players: ${clubPlayers.size}`,
      );
    }
  }

  console.log("");
  console.log("==============================================");
  console.log("          PARTIAL IMPORT REVIEW");
  console.log("==============================================");

  console.log("");
  console.log("CLUBS SELECTED FOR IMPORT");

  console.table(importedClubs);

  console.log("");
  console.log("CLUBS SKIPPED");

  console.table(skippedClubs);

  const totalPlayers = preparedProfiles.size;
  const totalRegistrations = preparedRegistrations.size;

  console.log("");
  console.log(`Eligible clubs: ${importedClubs.length}`);
  console.log(`Skipped clubs: ${skippedClubs.length}`);
  console.log(`Unique player profiles: ${totalPlayers}`);
  console.log(`Club registrations: ${totalRegistrations}`);
  console.log("API requests made: 0");
  console.log("Cache pages modified: 0");

  if (importedClubs.length === 0) {
    throw new Error(
      "Partial import stopped: no clubs have complete cached coverage. " +
        "No player or registration records were written.",
    );
  }

  if (totalPlayers === 0 || totalRegistrations === 0) {
    throw new Error(
      "Partial import stopped: no valid player records were prepared. " +
        "No player or registration records were written.",
    );
  }

  console.log("");
  console.log("The following database changes are ready:");
  console.log(`- Player profiles to upsert: ${totalPlayers}`);
  console.log(`- Club registrations to upsert: ${totalRegistrations}`);
  console.log(`- Clubs to import: ${importedClubs.length}`);
  console.log(`- Clubs to skip: ${skippedClubs.length}`);
  console.log("");
  console.log("No incomplete club will be imported.");

  let syncRunId: string | undefined;

  try {
    const [syncRun] = await db
      .insert(providerSyncRuns)
      .values({
        provider: "API_FOOTBALL",
        task: "PLAYER_IMPORT_PARTIAL",
        status: "RUNNING",
        requestCount: 0,
      })
      .returning({ id: providerSyncRuns.id });

    syncRunId = syncRun?.id;

    console.log("");
    console.log("Writing eligible player data to the database...");

    await db.transaction(async (tx: any) => {
      const playerIdMap = new Map<number, string>();

      // Upsert player profiles.
      for (const profile of preparedProfiles.values()) {
        const [savedPlayer] = await tx
          .insert(players)
          .values({
            providerPlayerId: profile.providerPlayerId,
            fullName: profile.fullName,
            photoUrl: profile.photoUrl,
            dateOfBirth: profile.dateOfBirth,
            nationality: profile.nationality,
          })
          .onConflictDoUpdate({
            target: players.providerPlayerId,
            set: {
              fullName: profile.fullName,
              photoUrl: profile.photoUrl,
              dateOfBirth: profile.dateOfBirth,
              nationality: profile.nationality,
            },
          })
          .returning({
            id: players.id,
            providerPlayerId: players.providerPlayerId,
          });

        if (savedPlayer) {
          playerIdMap.set(
            savedPlayer.providerPlayerId,
            savedPlayer.id,
          );
        }
      }

      // Upsert registrations only for eligible clubs.
      for (const registration of preparedRegistrations.values()) {
        const playerId = playerIdMap.get(
          registration.providerPlayerId,
        );

        if (!playerId) {
          throw new Error(
            `Could not resolve player ID for provider player ${registration.providerPlayerId}.`,
          );
        }

        await tx
          .insert(playerRegistrations)
          .values({
            playerId,
            clubId: registration.clubId,
            seasonId: seasonRow.id,
            position: registration.position,
            active: true,
          })
          .onConflictDoUpdate({
            target: [
              playerRegistrations.playerId,
              playerRegistrations.clubId,
              playerRegistrations.seasonId,
            ],
            set: {
              position: registration.position,
              active: true,
            },
          });
      }
    });

    if (syncRunId) {
      await db
        .update(providerSyncRuns)
        .set({
          status: "SUCCESS",
          requestCount: 0,
          finishedAt: new Date(),
          errorMessage:
            `Partial cache-only import. ` +
            `${importedClubs.length} clubs imported; ` +
            `${skippedClubs.length} clubs skipped.`,
        })
        .where(drizzle.eq(providerSyncRuns.id, syncRunId));
    }

    console.log("");
    console.log("==============================================");
    console.log("       PARTIAL IMPORT COMPLETED");
    console.log("==============================================");
    console.log(`Clubs imported: ${importedClubs.length}`);
    console.log(`Clubs skipped: ${skippedClubs.length}`);
    console.log(`Player profiles saved: ${totalPlayers}`);
    console.log(`Player registrations saved: ${totalRegistrations}`);
    console.log("API requests made: 0");
    console.log("Cache modified: NO");
    console.log("");
    console.log("Existing registrations outside the imported clubs were preserved.");
    console.log("No player or registration records were deleted.");
  } catch (error) {
    if (syncRunId) {
      try {
        await db
          .update(providerSyncRuns)
          .set({
            status: "FAILED",
            requestCount: 0,
            finishedAt: new Date(),
            errorMessage:
              error instanceof Error ? error.message : String(error),
          })
          .where(drizzle.eq(providerSyncRuns.id, syncRunId));
      } catch (updateError) {
        console.error(
          "Could not update provider sync run:",
          updateError,
        );
      }
    }

    throw error;
  }
}

async function main(): Promise<void> {
  if (!Number.isInteger(SEASON) || SEASON < 2000 || SEASON > 2100) {
    throw new Error(`Invalid FOOTBALL_SEASON: ${SEASON}`);
  }

  const options = parseArguments();

  const [
    { db },
    schema,
    { footballApi },
    drizzle,
  ] = await Promise.all([
    import("../src/db"),
    import("../src/db/schema"),
    import("../src/lib/football-api/client"),
    import("drizzle-orm"),
  ]);

  const {
    seasons,
    competitions,
    clubs,
    players,
    playerRegistrations,
    providerSyncRuns,
  } = schema;

  console.log("");
  console.log("==============================================");
  console.log("       FANTASY ARENA PLAYER IMPORTER");
  console.log("==============================================");
  console.log(`Season: ${SEASON_LABEL}`);
  console.log(`Competition: ${options.competition}`);
  console.log(`Team filter: ${options.teamId ?? "ALL CLUBS"}`);

  console.log(
    `Mode: ${
      options.recoverMissing
        ? "SAFE MISSING-PAGE RECOVERY"
        : options.discover
          ? "CONTROLLED DISCOVERY"
          : options.coverage
            ? "COVERAGE REPORT"
            : options.applyPartial
              ? "SAFE PARTIAL APPLY - CACHE ONLY"
              : options.apply
                ? "STRICT APPLY"
                : "DRY RUN"
    }`,
  );

  console.log(`Maximum API pages per club: ${MAX_API_PAGE}`);
  console.log(`Request delay: ${REQUEST_DELAY_MS}ms`);
  console.log(`Cache file: ${CACHE_FILE}`);
  console.log("==============================================");

  const cache = await loadCache();

  console.log(`Cached pages available: ${cache.size}`);

  if (options.refreshCache) {
    console.log("Cache refresh enabled.");
  }

  const [seasonRow] = await db
    .select()
    .from(seasons)
    .where(drizzle.eq(seasons.label, SEASON_LABEL))
    .limit(1);

  if (!seasonRow) {
    throw new Error(
      `Season ${SEASON_LABEL} was not found. Run football:sync first.`,
    );
  }

  // =========================================================
  // CONTROLLED DISCOVERY MODE
  // =========================================================

  if (options.discover) {
    const requestCounter: RequestCounter = {
      count: 0,
      maxRequests: options.maxRequests,
    };

    await runDiscovery(
      footballApi,
      db,
      schema,
      drizzle,
      options,
      cache,
      requestCounter,
    );

    return;
  }

  // =========================================================
  // SAFE MISSING-PAGE RECOVERY MODE
  // =========================================================

  if (options.recoverMissing) {
    const requestCounter: RequestCounter = {
      count: 0,
      maxRequests: options.maxRequests,
    };

    await runMissingPageRecovery(
      footballApi,
      db,
      schema,
      drizzle,
      options,
      cache,
      requestCounter,
    );

    return;
  }

  const competitionCodes: CompetitionCode[] =
    options.competition === "ALL"
      ? ["EPL", "LALIGA"]
      : [options.competition];

  // =========================================================
  // CACHED-ONLY PLAYER COVERAGE REPORT
  // =========================================================

  if (options.coverage) {
    console.log("");
    console.log("==============================================");
    console.log("       PLAYER IMPORT COVERAGE REPORT");
    console.log("==============================================");
    console.log("Mode: CACHED-ONLY");
    console.log("API requests: DISABLED");
    console.log("Database writes: DISABLED");
    console.log("");

    const coverageRows: Array<{
      Competition: string;
      Club: string;
      "API Team ID": number | string;
      "Pages reported": number | string;
      "Pages cached": string;
      Players: number;
      Status: string;
    }> = [];

    let totalClubs = 0;
    let testedClubs = 0;
    let untestedClubs = 0;
    let completeClubs = 0;
    let planLimitedClubs = 0;
    let cacheIncompleteClubs = 0;
    let totalCachedPlayers = 0;

    for (const competitionCode of competitionCodes) {
      const [competition] = await db
        .select()
        .from(competitions)
        .where(
          drizzle.and(
            drizzle.eq(competitions.code, competitionCode),
            drizzle.eq(competitions.providerSeason, SEASON),
          ),
        )
        .limit(1);

      if (!competition) {
        throw new Error(
          `${competitionCode} for ${SEASON} was not found. ` +
            "Run football:sync first.",
        );
      }

      const competitionClubs = await db
        .select()
        .from(clubs)
        .where(drizzle.eq(clubs.competitionId, competition.id))
        .orderBy(drizzle.asc(clubs.name));

      const selectedClubs = options.teamId
        ? competitionClubs.filter(
            (club: any) =>
              Number(club.providerTeamId) === options.teamId,
          )
        : competitionClubs;

      if (options.teamId && selectedClubs.length === 0) {
        throw new Error(
          `Team ID ${options.teamId} was not found in ${competitionCode}.`,
        );
      }

      for (const club of selectedClubs) {
        totalClubs++;

        const teamId = Number(club.providerTeamId);

        if (!Number.isInteger(teamId) || teamId <= 0) {
          coverageRows.push({
            Competition: competitionCode,
            Club: club.name,
            "API Team ID": "INVALID",
            "Pages reported": "UNKNOWN",
            "Pages cached": "0",
            Players: 0,
            Status: "INVALID TEAM ID",
          });

          untestedClubs++;
          continue;
        }

        const firstPage = cache.get(cacheKey(teamId, 1));

        if (!firstPage) {
          const existingCachedPages = Array.from(
            cache.values(),
          ).filter(
            (entry) =>
              entry.teamId === teamId &&
              entry.season === SEASON,
          );

          const cachedPageNumbers = existingCachedPages
            .map((entry) => entry.page)
            .sort((a, b) => a - b);

          coverageRows.push({
            Competition: competitionCode,
            Club: club.name,
            "API Team ID": teamId,
            "Pages reported": "UNKNOWN",
            "Pages cached":
              cachedPageNumbers.length > 0
                ? cachedPageNumbers.join(", ")
                : "0",
            Players: 0,
            Status: "NOT TESTED - NO PAGE 1",
          });

          untestedClubs++;
          continue;
        }

        testedClubs++;

        const reportedPages = Math.max(
          1,
          Number(firstPage.totalPages || 1),
        );

        const accessiblePages = Math.min(
          reportedPages,
          MAX_API_PAGE,
        );

        const cachedPages = new Set<number>();
        const playerIds = new Set<number>();

        for (
          let page = 1;
          page <= accessiblePages;
          page++
        ) {
          const cachedPage = cache.get(
            cacheKey(teamId, page),
          );

          if (!cachedPage) continue;

          cachedPages.add(page);

          for (const row of cachedPage.response) {
            const playerId = Number(row.player?.id);

            if (
              Number.isInteger(playerId) &&
              playerId > 0
            ) {
              playerIds.add(playerId);
            }
          }
        }

        const pagesCached = cachedPages.size;
        const playersFound = playerIds.size;

        totalCachedPlayers += playersFound;

        let status: string;

        if (reportedPages > MAX_API_PAGE) {
          status = "INCOMPLETE - API PLAN LIMIT";
          planLimitedClubs++;
        } else if (pagesCached < reportedPages) {
          status = "INCOMPLETE - MISSING CACHE PAGES";
          cacheIncompleteClubs++;
        } else {
          status = "COMPLETE";
          completeClubs++;
        }

        coverageRows.push({
          Competition: competitionCode,
          Club: club.name,
          "API Team ID": teamId,
          "Pages reported": reportedPages,
          "Pages cached": `${pagesCached}/${reportedPages}`,
          Players: playersFound,
          Status: status,
        });
      }
    }

    console.log("");
    console.log("PLAYER COVERAGE BY CLUB");
    console.log("----------------------------------------------");

    console.table(coverageRows);

    console.log("");
    console.log("==============================================");
    console.log("             COVERAGE SUMMARY");
    console.log("==============================================");

    console.log(`Season: ${SEASON_LABEL}`);
    console.log(`Clubs examined: ${totalClubs}`);
    console.log(`Clubs tested: ${testedClubs}`);
    console.log(`Clubs not tested: ${untestedClubs}`);
    console.log(`Complete clubs: ${completeClubs}`);
    console.log(`Plan-limited clubs: ${planLimitedClubs}`);
    console.log(`Missing cache pages: ${cacheIncompleteClubs}`);
    console.log(
      `Cached players across tested clubs: ${totalCachedPlayers}`,
    );
    console.log(`Cached pages available: ${cache.size}`);

    console.log("");
    console.log("API REQUESTS MADE: 0");
    console.log("DATABASE RECORDS CHANGED: 0");
    console.log("");
    console.log("COVERAGE REPORT COMPLETED.");

    return;
  }

  // =========================================================
  // SAFE PARTIAL APPLY MODE
  // =========================================================

  if (options.applyPartial) {
    await runPartialApply(
      db,
      schema,
      drizzle,
      options,
      cache,
      seasonRow,
    );

    return;
  }

  // =========================================================
  // NORMAL PLAYER IMPORT / DRY RUN / STRICT APPLY
  // =========================================================

  const preparedProfiles = new Map<number, PreparedProfile>();

  const preparedRegistrations = new Map<
    string,
    PlayerRegistration
  >();

  const clubResults: ClubImportResult[] = [];
  const incompleteClubs: string[] = [];

  const requestCounter: RequestCounter = {
    count: 0,
  };

  let syncRunId: string | undefined;

  if (options.apply) {
    const [syncRun] = await db
      .insert(providerSyncRuns)
      .values({
        provider: "API_FOOTBALL",
        task: "PLAYER_IMPORT",
        status: "RUNNING",
        requestCount: 0,
      })
      .returning({ id: providerSyncRuns.id });

    syncRunId = syncRun?.id;
  }

  try {
    for (const competitionCode of competitionCodes) {
      console.log("");
      console.log("----------------------------------------------");
      console.log(`COMPETITION: ${competitionCode}`);
      console.log("----------------------------------------------");

      const [competition] = await db
        .select()
        .from(competitions)
        .where(
          drizzle.and(
            drizzle.eq(competitions.code, competitionCode),
            drizzle.eq(competitions.providerSeason, SEASON),
          ),
        )
        .limit(1);

      if (!competition) {
        throw new Error(
          `${competitionCode} for ${SEASON} was not found. Run football:sync first.`,
        );
      }

      const competitionClubs = await db
        .select()
        .from(clubs)
        .where(drizzle.eq(clubs.competitionId, competition.id))
        .orderBy(drizzle.asc(clubs.name));

      const selectedClubs = options.teamId
        ? competitionClubs.filter(
            (club: any) => Number(club.providerTeamId) === options.teamId,
          )
        : competitionClubs;

      if (options.teamId && selectedClubs.length === 0) {
        throw new Error(
          `Team ID ${options.teamId} was not found in ${competitionCode}.`,
        );
      }

      if (selectedClubs.length === 0) {
        console.warn(`No clubs found for ${competitionCode}.`);
        continue;
      }

      console.log(`Clubs selected: ${selectedClubs.length}`);

      for (const club of selectedClubs) {
        const teamId = Number(club.providerTeamId);

        if (!Number.isInteger(teamId) || teamId <= 0) {
          incompleteClubs.push(
            `${club.name} (invalid provider team ID)`,
          );
          continue;
        }

        console.log("");
        console.log(`Club: ${club.name} (API ID: ${teamId})`);

        const clubPlayers = new Map<number, PlayerRegistration>();

        let reportedPages = 1;
        let fetchedPages = 0;
        let cachePages = 0;
        let apiPages = 0;

        const firstPage = await getPlayerPage(
          footballApi,
          teamId,
          1,
          cache,
          requestCounter,
          options.refreshCache,
        );

        reportedPages = firstPage.totalPages;
        fetchedPages++;

        if (firstPage.source === "CACHE") cachePages++;
        else apiPages++;

        const pagesToFetch = Math.min(
          reportedPages,
          MAX_API_PAGE,
        );

        const processRows = (rows: ApiPlayerRow[]) => {
          for (const row of rows) {
            const player = row.player;

            if (
              !player ||
              !Number.isInteger(Number(player.id)) ||
              !player.name
            ) {
              continue;
            }

            const position = getPositionForClub(row, teamId);

            if (!position) {
              console.warn(
                `Skipping ${player.name}: position unavailable.`,
              );
              continue;
            }

            const providerPlayerId = Number(player.id);

            const registration: PlayerRegistration = {
              providerPlayerId,
              fullName: player.name,
              photoUrl: player.photo ?? null,
              dateOfBirth: validDate(player.birth?.date),
              nationality: player.nationality ?? null,
              position,
              clubId: club.id,
            };

            clubPlayers.set(providerPlayerId, registration);

            if (!preparedProfiles.has(providerPlayerId)) {
              preparedProfiles.set(providerPlayerId, {
                providerPlayerId,
                fullName: registration.fullName,
                photoUrl: registration.photoUrl,
                dateOfBirth: registration.dateOfBirth,
                nationality: registration.nationality,
              });
            }

            preparedRegistrations.set(
              `${providerPlayerId}:${club.id}`,
              registration,
            );
          }
        };

        processRows(firstPage.data);

        for (let page = 2; page <= pagesToFetch; page++) {
          const result = await getPlayerPage(
            footballApi,
            teamId,
            page,
            cache,
            requestCounter,
            options.refreshCache,
          );

          fetchedPages++;

          if (result.source === "CACHE") cachePages++;
          else apiPages++;

          processRows(result.data);
        }

        const complete = reportedPages <= MAX_API_PAGE;

        if (!complete) {
          incompleteClubs.push(
            `${club.name} (${fetchedPages}/${reportedPages} pages)`,
          );

          console.warn(
            `INCOMPLETE: ${club.name} requires more than ${MAX_API_PAGE} pages.`,
          );
        }

        const source =
          cachePages > 0 && apiPages > 0
            ? "MIXED"
            : cachePages > 0
              ? "CACHE"
              : "API";

        clubResults.push({
          clubName: club.name,
          teamId,
          pagesReported: reportedPages,
          pagesFetched: fetchedPages,
          playersFound: clubPlayers.size,
          complete,
          source,
        });

        console.log(
          `Pages: ${fetchedPages}/${reportedPages} | ` +
            `Players: ${clubPlayers.size} | Source: ${source}`,
        );
      }
    }

    const totalPlayers = preparedProfiles.size;
    const totalRegistrations = preparedRegistrations.size;

    console.log("");
    console.log("==============================================");
    console.log("             IMPORT SUMMARY");
    console.log("==============================================");

    console.table(
      clubResults.map((result) => ({
        Club: result.clubName,
        "Pages fetched": `${result.pagesFetched}/${result.pagesReported}`,
        Players: result.playersFound,
        Coverage: result.complete ? "COMPLETE" : "INCOMPLETE",
        Source: result.source,
      })),
    );

    console.log(`Unique player profiles: ${totalPlayers}`);
    console.log(`Club registrations: ${totalRegistrations}`);
    console.log(`Network requests made: ${requestCounter.count}`);
    console.log(`Cached pages available: ${cache.size}`);
    console.log(`Incomplete clubs: ${incompleteClubs.length}`);

    if (incompleteClubs.length > 0) {
      console.log("");
      console.warn("INCOMPLETE COVERAGE:");

      for (const name of incompleteClubs) {
        console.warn(`- ${name}`);
      }
    }

    if (!options.apply) {
      console.log("");
      console.log("DRY RUN COMPLETE.");
      console.log("No player or registration records were changed.");
      console.log("Successfully retrieved pages have been cached.");
      return;
    }

    if (incompleteClubs.length > 0) {
      throw new Error(
        "Import blocked: incomplete player coverage was detected. " +
          "No player or registration records have been written.",
      );
    }

    console.log("");
    console.log("Writing player data to the database...");

    await db.transaction(async (tx: any) => {
      const playerIdMap = new Map<number, string>();

      for (const profile of preparedProfiles.values()) {
        const [savedPlayer] = await tx
          .insert(players)
          .values({
            providerPlayerId: profile.providerPlayerId,
            fullName: profile.fullName,
            photoUrl: profile.photoUrl,
            dateOfBirth: profile.dateOfBirth,
            nationality: profile.nationality,
          })
          .onConflictDoUpdate({
            target: players.providerPlayerId,
            set: {
              fullName: profile.fullName,
              photoUrl: profile.photoUrl,
              dateOfBirth: profile.dateOfBirth,
              nationality: profile.nationality,
            },
          })
          .returning({
            id: players.id,
            providerPlayerId: players.providerPlayerId,
          });

        if (savedPlayer) {
          playerIdMap.set(
            savedPlayer.providerPlayerId,
            savedPlayer.id,
          );
        }
      }

      for (const registration of preparedRegistrations.values()) {
        const playerId = playerIdMap.get(
          registration.providerPlayerId,
        );

        if (!playerId) {
          throw new Error(
            `Could not resolve player ID for provider player ${registration.providerPlayerId}.`,
          );
        }

        await tx
          .insert(playerRegistrations)
          .values({
            playerId,
            clubId: registration.clubId,
            seasonId: seasonRow.id,
            position: registration.position,
            active: true,
          })
          .onConflictDoUpdate({
            target: [
              playerRegistrations.playerId,
              playerRegistrations.clubId,
              playerRegistrations.seasonId,
            ],
            set: {
              position: registration.position,
              active: true,
            },
          });
      }
    });

    console.log("");
    console.log("DATABASE IMPORT COMPLETED.");
    console.log(`Player profiles saved: ${totalPlayers}`);
    console.log(`Player registrations saved: ${totalRegistrations}`);

    if (syncRunId) {
      await db
        .update(providerSyncRuns)
        .set({
          status: "SUCCESS",
          requestCount: requestCounter.count,
          finishedAt: new Date(),
          errorMessage: null,
        })
        .where(drizzle.eq(providerSyncRuns.id, syncRunId));
    }
  } catch (error) {
    if (syncRunId) {
      try {
        await db
          .update(providerSyncRuns)
          .set({
            status: "FAILED",
            requestCount: requestCounter.count,
            finishedAt: new Date(),
            errorMessage:
              error instanceof Error ? error.message : String(error),
          })
          .where(drizzle.eq(providerSyncRuns.id, syncRunId));
      } catch (updateError) {
        console.error(
          "Could not update provider sync run:",
          updateError,
        );
      }
    }

    throw error;
  }
}

main().catch((error) => {
  console.error("");
  console.error("PLAYER IMPORT FAILED");
  console.error(
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
