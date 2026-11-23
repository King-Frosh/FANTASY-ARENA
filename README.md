# Fantasy Arena — starter codebase

A multi-competition fantasy football platform for the English Premier League and LaLiga.

## Product decisions
- Responsive web first; mobile app later (API-first architecture).
- One user account can own an EPL team and a LaLiga team.
- A combined competition ranks each user's two competition teams together.
- Each league has its own squad, budget, transfers, gameweeks and scoring.
- Scoring is configurable: FPL-inspired defaults plus custom rule support.
- API provider: API-Football (API-SPORTS v3).

## Stack
- Next.js App Router + TypeScript
- PostgreSQL + Drizzle ORM
- Zod validation
- API-Football accessed server-side only
- Background worker/cron for fixture and event synchronization
- Optional Redis/queue and WebSocket/SSE layer when traffic requires it

## Quick start
1. Install Node.js 20.9+ and PostgreSQL 15+.
2. Copy `.env.example` to `.env.local` and fill in the values.
3. Run `npm install`.
4. Run `npm run db:generate`, then `npm run db:migrate`.
5. Run `npm run dev`.

The first migration/schema is a foundation, not a finished production database. Add migrations incrementally and test them against a disposable database before production.

## Environment
- `DATABASE_URL`: PostgreSQL connection string.
- `API_FOOTBALL_KEY`: API-Football key. Never expose it to browser code.
- `API_FOOTBALL_BASE_URL`: defaults to `https://v3.football.api-sports.io`.
- `APP_URL`: canonical application URL.
- `APP_TIMEZONE`: defaults to `Africa/Lagos`.

## Important architecture rules
1. Never call API-Football directly from the browser.
2. Store provider IDs separately from internal IDs.
3. Keep EPL and LaLiga as separate `competition` records. The same user can own one fantasy team per competition and season.
4. Combined competition points are the sum of the user's finalized EPL and LaLiga points for the same platform gameweek/round policy. The product owner must define how mismatched fixture calendars are grouped before launch.
5. Match events must be idempotent. Use `(provider, provider_event_id)` as a uniqueness key where the provider supplies a stable event identifier; otherwise create a deterministic event fingerprint and retain raw payloads.
6. Keep an append-only points ledger. Revisions create adjustment/recalculation records; do not silently overwrite scoring history.
7. Freeze team selections at the relevant competition deadline. A combined competition must not cause an EPL deadline to lock LaLiga changes, or vice versa.
8. All money values are integer minor units or integer tenths of a million; avoid floating point.

## API-Football setup
API-Football v3 uses `https://v3.football.api-sports.io` and the `x-apisports-key` request header. The API supports league/team/player, fixtures, fixture events, lineups and statistics endpoints. Confirm that your subscription's coverage flags include player statistics and events for both competitions before relying on them.

The provider's league IDs and available season values should be discovered from its `/leagues` endpoint and stored in `competitions.provider_league_id`; do not hardcode guessed IDs. For every season, inspect the returned `coverage` object. API coverage can vary by season and data can be delayed or corrected.

## Initial scoring defaults
The rules in `src/lib/scoring/rules.ts` are sample product defaults, not official FPL rules. They are intentionally editable. Decide final points, bonus algorithm, appearance rules, clean-sheet minutes, goalkeeper saves, defensive contributions, own goals, penalty misses, and red-card treatment before launch.

## MVP implementation sequence
1. Foundation: environment, database, authentication, user profile.
2. Data ingestion: discover league IDs, sync teams, squads, players, fixtures and coverage.
3. Team builder: budget, positions, max players per club, 15-player squad and valid XI.
4. Gameweeks/deadlines: separate deadlines per competition and season.
5. Scoring: normalized match events, scoring ledger, captaincy, bench and autosubs.
6. Transfers/chips: transaction-safe transfers and price history.
7. Leaderboards: competition-specific, private leagues and combined competition.
8. Admin, observability, security, QA and production deployment.

## Not included yet
Authentication screens, complete UI, API synchronization worker, actual migrations, live scoring transport, payments, and production deployment configuration remain follow-on work. The code here establishes the architecture and core domain primitives.

## Phase 2: API discovery and first sync

See [`docs/PHASE-2-SETUP.md`](docs/PHASE-2-SETUP.md). Run `npm run football:discover` first; confirm the 2026 season league IDs and coverage from your own API key before setting the two league ID environment variables. Then generate/apply Drizzle migrations and run `npm run football:sync`.

A Render Cron Job Blueprint is provided in `render.yaml`. Keep `API_FOOTBALL_KEY` and `DATABASE_URL` in Render/Vercel secret environment variables, never in source control.
