CREATE TYPE "public"."competition_code" AS ENUM('EPL', 'LALIGA');--> statement-breakpoint
CREATE TYPE "public"."match_event_kind" AS ENUM('GOAL', 'OWN_GOAL', 'ASSIST', 'YELLOW_CARD', 'RED_CARD', 'PENALTY_SAVED', 'PENALTY_MISSED', 'SAVE', 'CLEAN_SHEET', 'APPEARANCE', 'BONUS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."fixture_status" AS ENUM('SCHEDULED', 'LIVE', 'HALF_TIME', 'FINISHED', 'POSTPONED', 'CANCELLED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."gameweek_status" AS ENUM('DRAFT', 'OPEN', 'LOCKED', 'LIVE', 'PROVISIONAL', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."fantasy_league_kind" AS ENUM('GLOBAL', 'PRIVATE', 'PUBLIC', 'COMBINED');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('GK', 'DEF', 'MID', 'FWD');--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"provider_team_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"short_name" varchar(20),
	"logo_url" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combined_gameweek_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"platform_round" integer NOT NULL,
	"epl_points" integer DEFAULT 0 NOT NULL,
	"laliga_points" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"finalized" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "competition_code" NOT NULL,
	"name" varchar(100) NOT NULL,
	"country" varchar(80) NOT NULL,
	"provider" varchar(40) DEFAULT 'API_FOOTBALL' NOT NULL,
	"provider_league_id" integer,
	"provider_season" integer,
	"coverage" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"kind" "fantasy_league_kind" NOT NULL,
	"competition_id" uuid,
	"season_id" uuid NOT NULL,
	"invite_code" varchar(32),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_leagues_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "fantasy_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"budget_tenths" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"gameweek_id" uuid,
	"provider_fixture_id" integer NOT NULL,
	"home_club_id" uuid NOT NULL,
	"away_club_id" uuid NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"status" "fixture_status" DEFAULT 'SCHEDULED' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"raw_payload" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_provider_fixture_id_unique" UNIQUE("provider_fixture_id")
);
--> statement-breakpoint
CREATE TABLE "gameweeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" varchar(80),
	"deadline_at" timestamp with time zone NOT NULL,
	"status" "gameweek_status" DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_members_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"player_id" uuid,
	"assist_player_id" uuid,
	"kind" "match_event_kind" NOT NULL,
	"minute" integer,
	"provider_event_id" varchar(160),
	"fingerprint" varchar(200) NOT NULL,
	"raw_payload" jsonb,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_gameweek_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_registration_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"breakdown" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"position" "player_position" NOT NULL,
	"season_id" uuid NOT NULL,
	"price_tenths" integer DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_player_id" integer NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"photo_url" text,
	"date_of_birth" timestamp with time zone,
	"nationality" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_provider_player_id_unique" UNIQUE("provider_player_id")
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"source_player_points_id" uuid,
	"points_delta" integer NOT NULL,
	"reason" varchar(160) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "provider_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"task" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"rule_key" varchar(80) NOT NULL,
	"position" "player_position",
	"points" integer NOT NULL,
	"config" jsonb,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(20) NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"player_registration_id" uuid NOT NULL,
	"purchase_price_tenths" integer NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"is_vice_captain" boolean DEFAULT false NOT NULL,
	"bench_order" integer,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"player_out_registration_id" uuid NOT NULL,
	"player_in_registration_id" uuid NOT NULL,
	"cost_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"password_hash" text,
	"auth_provider" varchar(40) DEFAULT 'local' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combined_gameweek_scores" ADD CONSTRAINT "combined_gameweek_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combined_gameweek_scores" ADD CONSTRAINT "combined_gameweek_scores_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_leagues" ADD CONSTRAINT "fantasy_leagues_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_leagues" ADD CONSTRAINT "fantasy_leagues_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_leagues" ADD CONSTRAINT "fantasy_leagues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_club_id_clubs_id_fk" FOREIGN KEY ("home_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_club_id_clubs_id_fk" FOREIGN KEY ("away_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameweeks" ADD CONSTRAINT "gameweeks_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameweeks" ADD CONSTRAINT "gameweeks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_fantasy_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."fantasy_leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_assist_player_id_players_id_fk" FOREIGN KEY ("assist_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_gameweek_points" ADD CONSTRAINT "player_gameweek_points_player_registration_id_player_registrations_id_fk" FOREIGN KEY ("player_registration_id") REFERENCES "public"."player_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_gameweek_points" ADD CONSTRAINT "player_gameweek_points_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_registrations" ADD CONSTRAINT "player_registrations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_registrations" ADD CONSTRAINT "player_registrations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_registrations" ADD CONSTRAINT "player_registrations_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_fantasy_team_id_fantasy_teams_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_source_player_points_id_player_gameweek_points_id_fk" FOREIGN KEY ("source_player_points_id") REFERENCES "public"."player_gameweek_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rules" ADD CONSTRAINT "scoring_rules_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rules" ADD CONSTRAINT "scoring_rules_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_fantasy_team_id_fantasy_teams_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_players" ADD CONSTRAINT "team_players_player_registration_id_player_registrations_id_fk" FOREIGN KEY ("player_registration_id") REFERENCES "public"."player_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fantasy_team_id_fantasy_teams_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_out_registration_id_player_registrations_id_fk" FOREIGN KEY ("player_out_registration_id") REFERENCES "public"."player_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_in_registration_id_player_registrations_id_fk" FOREIGN KEY ("player_in_registration_id") REFERENCES "public"."player_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "club_provider_uq" ON "clubs" USING btree ("competition_id","provider_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "combined_user_season_round_uq" ON "combined_gameweek_scores" USING btree ("user_id","season_id","platform_round");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_season_uq" ON "competitions" USING btree ("code","provider_season");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_team_user_comp_season_uq" ON "fantasy_teams" USING btree ("user_id","competition_id","season_id");--> statement-breakpoint
CREATE INDEX "fixtures_kickoff_idx" ON "fixtures" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "fixtures_gameweek_idx" ON "fixtures" USING btree ("gameweek_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gameweek_comp_season_number_uq" ON "gameweeks" USING btree ("competition_id","season_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "match_event_fingerprint_uq" ON "match_events" USING btree ("fixture_id","fingerprint");--> statement-breakpoint
CREATE INDEX "match_events_player_idx" ON "match_events" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_gw_revision_uq" ON "player_gameweek_points" USING btree ("player_registration_id","gameweek_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "player_registration_uq" ON "player_registrations" USING btree ("player_id","club_id","season_id");--> statement-breakpoint
CREATE INDEX "registration_club_idx" ON "player_registrations" USING btree ("club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_rule_uq" ON "scoring_rules" USING btree ("competition_id","season_id","rule_key","position");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_label_uq" ON "seasons" USING btree ("label");--> statement-breakpoint
CREATE UNIQUE INDEX "team_player_uq" ON "team_players" USING btree ("fantasy_team_id","player_registration_id");--> statement-breakpoint
CREATE INDEX "team_players_team_idx" ON "team_players" USING btree ("fantasy_team_id");