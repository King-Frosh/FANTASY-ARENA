export type Position = "GK" | "DEF" | "MID" | "FWD";
export type PlayerMatchStats = {
  position: Position;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  penaltiesSaved: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesMissed: number;
};
