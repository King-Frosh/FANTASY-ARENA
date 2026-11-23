import type { Position } from "./types";

export type RuleSet = {
  appearanceUnder60: number;
  appearance60Plus: number;
  goal: Record<Position, number>;
  assist: number;
  cleanSheet: Partial<Record<Position, number>>;
  everyThreeSaves: number;
  penaltySave: number;
  yellowCard: number;
  redCard: number;
  ownGoal: number;
  penaltyMissed: number;
};

export const DEFAULT_RULES: RuleSet = {
  appearanceUnder60: 1,
  appearance60Plus: 2,
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  everyThreeSaves: 1,
  penaltySave: 5,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  penaltyMissed: -2,
};
