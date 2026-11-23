# Fantasy Arena — Technical Specification

## 1. Product model
Fantasy Arena has two separate fantasy competitions (EPL and LaLiga) and a third combined ranking layer. A user has one account and may own one team per competition per season. Each competition has its own squad, prices, deadlines, transfers, chips, scoring rules and gameweek rankings.

### Combined competition policy (must be finalized)
The two real-world leagues do not necessarily play on identical calendars. The recommended initial policy is a **platform round**: a combined round is a defined date window (for example Monday 00:00 through Sunday 23:59 UTC), and it aggregates each user's finalized EPL and LaLiga fantasy points whose fixtures fall inside that window. Late/corrected match data keeps the combined round provisional until both competitions are finalized or an admin closes it. Do not assume EPL Gameweek 12 equals LaLiga Jornada 12.

## 2. Domain boundaries
- Identity: users and authentication identities.
- Football catalog: competitions, seasons, clubs, players, registrations.
- Scheduling: gameweeks, fixtures and fixture-to-gameweek mapping.
- Fantasy roster: fantasy teams, selected players, captaincy, bench order.
- Transactions: transfers, price history and chips.
- Match intelligence: normalized events and raw provider payloads.
- Scoring: rules, player scores, points ledger and revisions.
- Social: public/private leagues, members and invitations.
- Aggregation: combined platform rounds and combined scores.
- Operations: provider sync runs, admin actions and audit logs.

## 3. Key constraints
- Unique team per `(user, competition, season)`.
- A registration identifies a player's club, position and season; transfers between clubs create a new registration or update effective-dated registration history.
- Squad selection must be validated server-side inside a database transaction.
- A squad has 15 players by default: 2 GK, 5 DEF, 5 MID, 3 FWD; max 3 from one club; budget 1000 tenths (£100.0m).
- Starting XI must satisfy an allowed formation: GK=1, DEF 3–5, MID 2–5, FWD 1–3, total 11. Bench has four players with goalkeeper substitution handled separately.
- A player cannot be selected twice in one team.
- Captain and vice-captain must be distinct members of the current squad.
- Team and transfer mutations must be rejected after the relevant deadline.
- Combined competition membership is user-based; points are aggregated from both eligible team score streams.

## 4. API-Football integration
Base URL: `https://v3.football.api-sports.io`; send the API key in `x-apisports-key`. Keep key server-side. Discover competition IDs from `/leagues` and store the selected IDs and season coverage. Use `/teams`, `/players/squads`, `/fixtures`, `/fixtures/events`, `/fixtures/lineups`, and `/fixtures/statistics` as needed.

Sync strategy:
- Competition metadata: daily or when admin requests refresh.
- Clubs and squads: daily/weekly based on provider update recommendations.
- Fixtures: daily, with more frequent refresh close to kickoff.
- Live fixtures/events: only poll fixtures currently in progress, respecting provider minute and daily quotas.
- Finalization: re-fetch events/statistics after full time and run a reconciliation pass.
- Save raw payloads, provider timestamps, request metadata and sync errors.
- Use backoff for 429/5xx responses and inspect provider rate-limit headers.

Coverage checks are mandatory. The provider documentation notes that coverage varies by competition and season; player stats and events must be confirmed before those fields drive scoring. API data may be delayed or corrected.

## 5. Scoring pipeline
1. Fetch provider event/statistics payload.
2. Normalize to internal event schema.
3. Deduplicate by provider event ID or stable fingerprint.
4. Resolve provider player IDs to internal player registrations for that fixture/season.
5. Calculate player points using versioned scoring rules.
6. Store a player-gameweek score revision and breakdown.
7. Recompute team totals, captaincy, vice-captain fallback and automatic substitutions.
8. Append ledger deltas; retain prior revisions.
9. Recompute competition leaderboard and combined platform-round totals.
10. Mark provisional/final based on fixture and competition finalization state.

All scoring operations must be idempotent. Reprocessing the same provider payload must not award points twice.

## 6. Combined ranking
Combined score = finalized EPL team points + finalized LaLiga team points in the platform round. If a user has not created a team in one competition, define whether that side contributes zero or makes the user ineligible; recommended MVP behaviour is zero points and visible "team not entered" status. Combined ranks use total points, then a configurable tie-break policy.

## 7. API routes (planned)
- `GET /api/competitions`
- `GET /api/competitions/:code/players`
- `GET /api/competitions/:code/fixtures`
- `GET /api/me/teams`
- `POST /api/teams/:competitionCode/squad`
- `POST /api/teams/:competitionCode/transfers`
- `POST /api/teams/:competitionCode/captain`
- `GET /api/leaderboards/:competitionCode`
- `GET /api/leaderboards/combined`
- `POST /api/admin/sync/:task`
- `POST /api/admin/gameweeks/:id/finalize`

## 8. Security and reliability
- Authentication via a maintained provider or secure session implementation; do not store plaintext passwords.
- Authorization on every team, league and admin route.
- Rate-limit login, invite, transfer and public API routes.
- Validate all inputs with Zod.
- Use transaction locks when changing rosters or processing transfers.
- Secrets only in server environment variables.
- Audit admin changes and manual scoring corrections.
- Back up PostgreSQL and test restoration.
- Monitor sync lag, API quota, failed jobs, scoring revisions and leaderboard latency.

## 9. Mobile strategy
Build the backend as a stable JSON API and keep domain logic outside React components. Later, a React Native/Expo client can reuse API contracts and TypeScript domain packages. Do not make the website the source of scoring truth.

## 10. Release gates
Before public launch:
- Verify provider coverage and commercial/image rights.
- Validate all squad/formation edge cases.
- Test captain absent, vice-captain fallback and bench autosubs.
- Test postponed/cancelled/abandoned fixtures.
- Test own goals, VAR reversals, duplicate and corrected events.
- Test transfers racing with deadlines.
- Test combined round boundaries across time zones.
- Load test live score and leaderboard endpoints.
