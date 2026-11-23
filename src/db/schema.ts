import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean, timestamp,
  numeric, jsonb, uniqueIndex, index, primaryKey
} from "drizzle-orm/pg-core";

export const competitionCode = pgEnum("competition_code", ["EPL", "LALIGA"]);
export const playerPosition = pgEnum("player_position", ["GK", "DEF", "MID", "FWD"]);
export const fixtureStatus = pgEnum("fixture_status", ["SCHEDULED", "LIVE", "HALF_TIME", "FINISHED", "POSTPONED", "CANCELLED", "ABANDONED"]);
export const gameweekStatus = pgEnum("gameweek_status", ["DRAFT", "OPEN", "LOCKED", "LIVE", "PROVISIONAL", "FINAL"]);
export const leagueKind = pgEnum("fantasy_league_kind", ["GLOBAL", "PRIVATE", "PUBLIC", "COMBINED"]);
export const eventKind = pgEnum("match_event_kind", ["GOAL", "OWN_GOAL", "ASSIST", "YELLOW_CARD", "RED_CARD", "PENALTY_SAVED", "PENALTY_MISSED", "SAVE", "CLEAN_SHEET", "APPEARANCE", "BONUS", "OTHER"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  passwordHash: text("password_hash"),
  authProvider: varchar("auth_provider", { length: 40 }).default("local").notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const seasons = pgTable("seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: varchar("label", { length: 20 }).notNull(), // e.g. 2026-2027
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isCurrent: boolean("is_current").default(false).notNull(),
}, t => [uniqueIndex("seasons_label_uq").on(t.label)]);

export const competitions = pgTable("competitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: competitionCode("code").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  country: varchar("country", { length: 80 }).notNull(),
  provider: varchar("provider", { length: 40 }).default("API_FOOTBALL").notNull(),
  providerLeagueId: integer("provider_league_id"),
  providerSeason: integer("provider_season"),
  coverage: jsonb("coverage").$type<Record<string, unknown>>(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("competition_season_uq").on(t.code, t.providerSeason)]);

export const clubs = pgTable("clubs", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id),
  providerTeamId: integer("provider_team_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  shortName: varchar("short_name", { length: 20 }),
  logoUrl: text("logo_url"),
  active: boolean("active").default(true).notNull(),
}, t => [uniqueIndex("club_provider_uq").on(t.competitionId, t.providerTeamId)]);

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerPlayerId: integer("provider_player_id").notNull().unique(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  photoUrl: text("photo_url"),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
  nationality: varchar("nationality", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playerRegistrations = pgTable("player_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  playerId: uuid("player_id").notNull().references(() => players.id),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  position: playerPosition("position").notNull(),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  priceTenths: integer("price_tenths").notNull().default(50), // 50 = £5.0m
  active: boolean("active").default(true).notNull(),
}, t => [uniqueIndex("player_registration_uq").on(t.playerId, t.clubId, t.seasonId), index("registration_club_idx").on(t.clubId)]);

export const gameweeks = pgTable("gameweeks", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  number: integer("number").notNull(),
  name: varchar("name", { length: 80 }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  status: gameweekStatus("status").default("DRAFT").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
}, t => [uniqueIndex("gameweek_comp_season_number_uq").on(t.competitionId, t.seasonId, t.number)]);

export const fixtures = pgTable("fixtures", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  gameweekId: uuid("gameweek_id").references(() => gameweeks.id),
  providerFixtureId: integer("provider_fixture_id").notNull().unique(),
  homeClubId: uuid("home_club_id").notNull().references(() => clubs.id),
  awayClubId: uuid("away_club_id").notNull().references(() => clubs.id),
  kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  status: fixtureStatus("status").default("SCHEDULED").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  rawPayload: jsonb("raw_payload"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("fixtures_kickoff_idx").on(t.kickoffAt), index("fixtures_gameweek_idx").on(t.gameweekId)]);

export const fantasyTeams = pgTable("fantasy_teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  name: varchar("name", { length: 60 }).notNull(),
  budgetTenths: integer("budget_tenths").notNull().default(1000), // £100.0m
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("fantasy_team_user_comp_season_uq").on(t.userId, t.competitionId, t.seasonId)]);

export const teamPlayers = pgTable("team_players", {
  id: uuid("id").defaultRandom().primaryKey(),
  fantasyTeamId: uuid("fantasy_team_id").notNull().references(() => fantasyTeams.id),
  playerRegistrationId: uuid("player_registration_id").notNull().references(() => playerRegistrations.id),
  purchasePriceTenths: integer("purchase_price_tenths").notNull(),
  isCaptain: boolean("is_captain").default(false).notNull(),
  isViceCaptain: boolean("is_vice_captain").default(false).notNull(),
  benchOrder: integer("bench_order"), // null means starting XI; 1..4 means bench order
  selectedAt: timestamp("selected_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("team_player_uq").on(t.fantasyTeamId, t.playerRegistrationId), index("team_players_team_idx").on(t.fantasyTeamId)]);

export const transfers = pgTable("transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  fantasyTeamId: uuid("fantasy_team_id").notNull().references(() => fantasyTeams.id),
  gameweekId: uuid("gameweek_id").notNull().references(() => gameweeks.id),
  playerOutRegistrationId: uuid("player_out_registration_id").notNull().references(() => playerRegistrations.id),
  playerInRegistrationId: uuid("player_in_registration_id").notNull().references(() => playerRegistrations.id),
  costPoints: integer("cost_points").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matchEvents = pgTable("match_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  fixtureId: uuid("fixture_id").notNull().references(() => fixtures.id),
  playerId: uuid("player_id").references(() => players.id),
  assistPlayerId: uuid("assist_player_id").references(() => players.id),
  kind: eventKind("kind").notNull(),
  minute: integer("minute"),
  providerEventId: varchar("provider_event_id", { length: 160 }),
  fingerprint: varchar("fingerprint", { length: 200 }).notNull(),
  rawPayload: jsonb("raw_payload"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("match_event_fingerprint_uq").on(t.fixtureId, t.fingerprint), index("match_events_player_idx").on(t.playerId)]);

export const scoringRules = pgTable("scoring_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  competitionId: uuid("competition_id").notNull().references(() => competitions.id),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  ruleKey: varchar("rule_key", { length: 80 }).notNull(),
  position: playerPosition("position"),
  points: integer("points").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>(),
  active: boolean("active").default(true).notNull(),
}, t => [uniqueIndex("scoring_rule_uq").on(t.competitionId, t.seasonId, t.ruleKey, t.position)]);

export const playerGameweekPoints = pgTable("player_gameweek_points", {
  id: uuid("id").defaultRandom().primaryKey(),
  playerRegistrationId: uuid("player_registration_id").notNull().references(() => playerRegistrations.id),
  gameweekId: uuid("gameweek_id").notNull().references(() => gameweeks.id),
  points: integer("points").notNull().default(0),
  provisional: boolean("provisional").default(true).notNull(),
  revision: integer("revision").default(1).notNull(),
  breakdown: jsonb("breakdown").$type<Record<string, number>>().notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("player_gw_revision_uq").on(t.playerRegistrationId, t.gameweekId, t.revision)]);

export const pointsLedger = pgTable("points_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  fantasyTeamId: uuid("fantasy_team_id").notNull().references(() => fantasyTeams.id),
  gameweekId: uuid("gameweek_id").notNull().references(() => gameweeks.id),
  sourcePlayerPointsId: uuid("source_player_points_id").references(() => playerGameweekPoints.id),
  pointsDelta: integer("points_delta").notNull(),
  reason: varchar("reason", { length: 160 }).notNull(),
  revision: integer("revision").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").references(() => users.id),
});

export const fantasyLeagues = pgTable("fantasy_leagues", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  kind: leagueKind("kind").notNull(),
  competitionId: uuid("competition_id").references(() => competitions.id),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  inviteCode: varchar("invite_code", { length: 32 }).unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leagueMembers = pgTable("league_members", {
  leagueId: uuid("league_id").notNull().references(() => fantasyLeagues.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [primaryKey({ columns: [t.leagueId, t.userId] })]);

export const combinedGameweekScores = pgTable("combined_gameweek_scores", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  seasonId: uuid("season_id").notNull().references(() => seasons.id),
  platformRound: integer("platform_round").notNull(),
  eplPoints: integer("epl_points").default(0).notNull(),
  laligaPoints: integer("laliga_points").default(0).notNull(),
  totalPoints: integer("total_points").default(0).notNull(),
  finalized: boolean("finalized").default(false).notNull(),
}, t => [uniqueIndex("combined_user_season_round_uq").on(t.userId, t.seasonId, t.platformRound)]);

export const providerSyncRuns = pgTable("provider_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull(),
  task: varchar("task", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  requestCount: integer("request_count").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
