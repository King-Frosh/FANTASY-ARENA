# Phase 2 — API discovery, synchronization and database setup

## Important season note

The current date is November 2026, so the default target is the 2026/27 season and API-Football season key `2026`. The script deliberately discovers league IDs and season coverage before accepting configured IDs. Do not assume an ID or that a plan covers a season.

## Local setup (Windows PowerShell)

1. Install Node.js 22 LTS and PostgreSQL (or provision a hosted PostgreSQL database).
2. Copy `.env.example` to `.env.local` and enter your API key locally. Keep `.env.local` out of Git.
3. Install dependencies: `npm install`.
4. Discover the provider's competition IDs and season coverage: `npm run football:discover`.
5. Inspect the returned names, country, season, and coverage. Copy the correct IDs into `API_FOOTBALL_EPL_LEAGUE_ID` and `API_FOOTBALL_LALIGA_LEAGUE_ID` in `.env.local`.
6. Generate SQL from the Drizzle schema: `npm run db:generate`.
7. Apply migrations: `npm run db:migrate`.
8. Synchronize clubs and fixtures: `npm run football:sync`.
9. Validate the application: `npm run typecheck` and `npm run build`.

The discovery script is read-only. The sync script upserts season, competition, clubs and fixtures. It does not yet import player registrations or calculate fantasy points; those are subsequent Phase 2/3 tasks after we validate the provider's squad and player-stat coverage.

## API-Football endpoints used

- `GET /leagues?search=Premier%20League&season=2026`
- `GET /leagues?search=La%20Liga&season=2026`
- `GET /teams?league={confirmed_id}&season=2026`
- `GET /fixtures?league={confirmed_id}&season=2026&from=2026-07-01&to=2027-06-30&timezone=Africa/Lagos`

The API key is sent as `x-apisports-key` from server-side code only. The discovery output includes the provider's coverage flags; verify at least fixtures, events, lineups, player statistics and team statistics before enabling corresponding game features.

## Render background worker

`render.yaml` defines a daily Render Cron Job for fixture/team synchronization. Create the Render service from this Blueprint and add the same PostgreSQL connection string and API key as secret environment variables. Add the two confirmed league IDs. For live scoring, do not poll every fixture indiscriminately: create a separate rate-limited live-fixture job that only polls active matches and respects API-Football response headers.

## Vercel website

Import the private GitHub repository into Vercel. Set `DATABASE_URL`, `API_FOOTBALL_KEY`, `FOOTBALL_SEASON`, and `FOOTBALL_DISCOVERY_TOKEN` in the Vercel project environment. Do not expose the API key with a `NEXT_PUBLIC_` prefix. The discovery route is protected by `Authorization: Bearer <FOOTBALL_DISCOVERY_TOKEN>` in production.

## Database migration policy

The Drizzle schema is the source of truth. Generate a reviewed migration with `npm run db:generate`, inspect the SQL in `drizzle/`, then apply with `npm run db:migrate`. Do not run schema push against production. Commit migration SQL with the corresponding schema change.

## Current limitations / gates

- League IDs are not pre-filled or guessed. They must come from the user's authenticated API response.
- API plan, season entitlement and endpoint coverage vary. The provider's coverage object is saved to `competitions.coverage`.
- The first sync is intentionally idempotent at the row level. Before production use, add a transaction boundary, retry/backoff, sync-run audit rows, pagination where relevant, and a dedicated worker lock to prevent overlapping cron executions.
- Player squads/statistics, positions, prices, gameweek mapping and event normalization require a follow-up sync after the league IDs and coverage are confirmed.
