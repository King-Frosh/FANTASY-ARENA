
const BASE_URL =
  process.env.API_FOOTBALL_BASE_URL ??
  "https://v3.football.api-sports.io";

export class FootballApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "FootballApiError";
  }
}

export type ApiFootballEnvelope<T> = {
  errors?: unknown[] | Record<string, unknown>;
  results: number;
  paging?: {
    current: number;
    total: number;
  };
  response: T;
};

export type LeagueCandidate = {
  league: {
    id: number;
    name: string;
    type?: string;
  };
  country: {
    name: string;
  };
  seasons: Array<{
    year: number;
    start?: string;
    end?: string;
    current?: boolean;
    coverage?: Record<string, boolean>;
  }>;
};

export type ApiFootballPlayer = {
  player: {
    id: number;
    name: string;
    firstname?: string;
    lastname?: string;
    age?: number;
    birth?: {
      date?: string;
      place?: string | null;
      country?: string | null;
    };
    nationality?: string | null;
    height?: string | null;
    weight?: string | null;
    injured?: boolean;
    photo?: string | null;
  };
  statistics: Array<{
    team?: {
      id?: number;
      name?: string;
      logo?: string;
    };
    league?: {
      id?: number;
      name?: string;
      season?: number;
    };
    games?: {
      appearences?: number;
      appearances?: number;
      lineups?: number;
      minutes?: number;
      number?: number | null;
      position?: string;
      rating?: string | null;
      captain?: boolean;
    };
  }>;
};

// Team information
export type ApiFootballTeam = {
  team: {
    id: number;
    name: string;
    code: string | null;
    country: string | null;
    founded: number | null;
    national: boolean;
    logo: string | null;
  };
  venue: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  } | null;
};

// Current squad information
export type ApiFootballSquad = {
  team: {
    id: number;
    name: string;
    logo: string | null;
  };
  players: Array<{
    id: number;
    name: string;
    age: number | null;
    number: number | null;
    position: string | null;
    photo: string | null;
  }>;
};

// Fixture information
export type ApiFootballFixture = {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: {
      first: number | null;
      second: number | null;
    };
    venue: {
      id: number | null;
      name: string | null;
      city: string | null;
    };
    status: {
      long: string;
      short: string;
      elapsed: number | null;
      extra: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string | null;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string | null;
      winner: boolean | null;
    };
    away: {
      id: number;
      name: string;
      logo: string | null;
      winner: boolean | null;
    };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: Record<string, unknown>;
};

// Match events
export type ApiFootballEvent = {
  time: {
    elapsed: number;
    extra: number | null;
  };
  team: {
    id: number;
    name: string;
    logo: string | null;
  };
  player: {
    id: number | null;
    name: string | null;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  type: string;
  detail: string;
  comments: string | null;
};

// Match lineups
export type ApiFootballLineup = {
  team: {
    id: number;
    name: string;
    logo: string | null;
    colors?: Record<string, unknown>;
  };
  coach: {
    id: number | null;
    name: string | null;
    photo: string | null;
  };
  formation: string | null;
  startXI: Array<{
    player: {
      id: number;
      name: string;
      number: number;
      pos: string | null;
      grid: string | null;
    };
  }>;
  substitutes: Array<{
    player: {
      id: number;
      name: string;
      number: number;
      pos: string | null;
      grid: string | null;
    };
  }>;
};

// Match statistics
export type ApiFootballFixtureStatistics = {
  team: {
    id: number;
    name: string;
    logo: string | null;
  };
  statistics: Array<{
    type: string;
    value: string | number | null;
  }>;
};

/**
 * Fetches an API-Football endpoint and returns the complete API envelope.
 *
 * This method preserves pagination metadata, including current page
 * and total pages, which is required for importing all player records.
 */
export async function footballGetWithMeta<T>(
  endpoint: string,
  params: Record<
    string,
    string | number | boolean | null | undefined
  > = {}
): Promise<ApiFootballEnvelope<T>> {
  const key = process.env.API_FOOTBALL_KEY;

  if (!key) {
    throw new FootballApiError(
      "API_FOOTBALL_KEY is not configured. Check your .env.local file."
    );
  }

  const normalizedEndpoint = endpoint.replace(/^\/+/, "");

  const url = new URL(
    `${BASE_URL.replace(/\/+$/, "")}/${normalizedEndpoint}`
  );

  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(name, String(value));
    }
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": key,
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new FootballApiError(
      `Could not connect to API-Football: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!response.ok) {
    throw new FootballApiError(
      `API-Football returned HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  let payload: ApiFootballEnvelope<T>;

  try {
    payload = (await response.json()) as ApiFootballEnvelope<T>;
  } catch {
    throw new FootballApiError(
      "API-Football returned an invalid JSON response."
    );
  }

  if (!payload || !Array.isArray(payload.response)) {
    throw new FootballApiError(
      "API-Football returned an unexpected response format."
    );
  }

  const errors = payload.errors;

  if (
    Array.isArray(errors)
      ? errors.length > 0
      : Object.keys(errors ?? {}).length > 0
  ) {
    throw new FootballApiError(
      `API-Football API error: ${JSON.stringify(errors)}`
    );
  }

  return payload;
}

/**
 * Fetches an API-Football endpoint and returns only its response data.
 *
 * Existing scripts can continue using this method without needing
 * to handle pagination metadata.
 */
export async function footballGet<T>(
  endpoint: string,
  params: Record<
    string,
    string | number | boolean | null | undefined
  > = {}
): Promise<T> {
  const payload = await footballGetWithMeta<T>(
    endpoint,
    params
  );

  return payload.response;
}

/**
 * API-Football endpoint helpers.
 */
export const footballApi = {
  // League discovery
  searchLeagues: (
    search: string,
    season: number
  ) =>
    footballGet<LeagueCandidate[]>("leagues", {
      search,
      season,
    }),

  leaguesByCountry: (
    country: string,
    season: number
  ) =>
    footballGet<LeagueCandidate[]>("leagues", {
      country,
      season,
    }),

  // Clubs
  teams: (
    league: number,
    season: number
  ) =>
    footballGet<ApiFootballTeam[]>("teams", {
      league,
      season,
    }),

  // Current squad endpoint
  squads: (team: number) =>
    footballGet<ApiFootballSquad[]>("players/squads", {
      team,
    }),

  // Historical player data without pagination metadata
  players: (
    team: number,
    season: number,
    page = 1
  ) =>
    footballGet<ApiFootballPlayer[]>("players", {
      team,
      season,
      page,
    }),

  // Historical player data with pagination metadata
  playersPage: (
    team: number,
    season: number,
    page = 1
  ) =>
    footballGetWithMeta<ApiFootballPlayer[]>("players", {
      team,
      season,
      page,
    }),

  // Fixtures
  fixtures: (
    league: number,
    season: number,
    from: string,
    to: string
  ) =>
    footballGet<ApiFootballFixture[]>("fixtures", {
      league,
      season,
      from,
      to,
      timezone: "Africa/Lagos",
    }),

  // Match events
  fixtureEvents: (fixture: number) =>
    footballGet<ApiFootballEvent[]>("fixtures/events", {
      fixture,
    }),

  // Match lineups
  fixtureLineups: (fixture: number) =>
    footballGet<ApiFootballLineup[]>("fixtures/lineups", {
      fixture,
    }),

  // Match statistics
  fixtureStatistics: (fixture: number) =>
    footballGet<ApiFootballFixtureStatistics[]>("fixtures/statistics", {
      fixture,
    }),
};
