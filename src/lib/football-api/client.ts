const BASE_URL = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";

export class FootballApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "FootballApiError";
  }
}

type ApiFootballEnvelope<T> = {
  errors?: unknown[] | Record<string, unknown>;
  results: number;
  paging?: { current: number; total: number };
  response: T;
};

export type LeagueCandidate = {
  league: { id: number; name: string; type?: string };
  country: { name: string };
  seasons: Array<{ year: number; start?: string; end?: string; current?: boolean; coverage?: Record<string, boolean> }>;
};

export async function footballGet<T>(endpoint: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new FootballApiError("API_FOOTBALL_KEY is not configured");
  const url = new URL(`${BASE_URL}/${endpoint.replace(/^\\//, "")}`);
  for (const [name, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(name, String(value));
  const response = await fetch(url, { method: "GET", headers: { "x-apisports-key": key }, cache: "no-store" });
  if (!response.ok) throw new FootballApiError(`API-Football returned HTTP ${response.status}`, response.status);
  const payload = (await response.json()) as ApiFootballEnvelope<T>;
  const errors = payload.errors;
  if (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors ?? {}).length > 0) {
    throw new FootballApiError(`API-Football error: ${JSON.stringify(errors)}`);
  }
  return payload.response;
}

export const footballApi = {
  searchLeagues: (search: string, season: number) => footballGet<LeagueCandidate[]>("leagues", { search, season }),
  leaguesByCountry: (country: string, season: number) => footballGet<LeagueCandidate[]>("leagues", { country, season }),
  teams: (league: number, season: number) => footballGet<any[]>("teams", { league, season }),
  squads: (team: number) => footballGet<any[]>("players/squads", { team }),
  fixtures: (league: number, season: number, from: string, to: string) => footballGet<any[]>("fixtures", { league, season, from, to, timezone: "Africa/Lagos" }),
  fixtureEvents: (fixture: number) => footballGet<any[]>("fixtures/events", { fixture }),
  fixtureLineups: (fixture: number) => footballGet<any[]>("fixtures/lineups", { fixture }),
  fixtureStatistics: (fixture: number) => footballGet<any[]>("fixtures/statistics", { fixture }),
};
