import { DEFAULT_RULES, type RuleSet } from "./rules";
import type { PlayerMatchStats } from "./types";

export type PointsBreakdown = Record<string, number>;

export function calculatePlayerPoints(
  stats: PlayerMatchStats,
  rules: RuleSet = DEFAULT_RULES,
): { total: number; breakdown: PointsBreakdown } {
  const b: PointsBreakdown = {};
  const add = (key: string, value: number) => { if (value !== 0) b[key] = value; };

  if (stats.minutes > 0) {
    add("appearance", stats.minutes >= 60 ? rules.appearance60Plus : rules.appearanceUnder60);
  }
  add("goals", stats.goals * rules.goal[stats.position]);
  add("assists", stats.assists * rules.assist);
  if (stats.cleanSheet && stats.minutes >= 60) add("cleanSheet", rules.cleanSheet[stats.position] ?? 0);
  add("saves", Math.floor(stats.saves / 3) * rules.everyThreeSaves);
  add("penaltiesSaved", stats.penaltiesSaved * rules.penaltySave);
  add("yellowCards", stats.yellowCards * rules.yellowCard);
  add("redCards", stats.redCards * rules.redCard);
  add("ownGoals", stats.ownGoals * rules.ownGoal);
  add("penaltiesMissed", stats.penaltiesMissed * rules.penaltyMissed);

  return { total: Object.values(b).reduce((sum, points) => sum + points, 0), breakdown: b };
}
