import type { Position } from "@/lib/scoring/types";

export type SquadPlayer = { registrationId: string; clubId: string; position: Position; priceTenths: number };
export type SquadRules = {
  squadSize: number;
  budgetTenths: number;
  maxPerClub: number;
  required: Record<Position, number>;
};

export const DEFAULT_SQUAD_RULES: SquadRules = {
  squadSize: 15,
  budgetTenths: 1000,
  maxPerClub: 3,
  required: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
};

export function validateSquad(players: SquadPlayer[], rules = DEFAULT_SQUAD_RULES): string[] {
  const errors: string[] = [];
  if (players.length !== rules.squadSize) errors.push(`Squad must contain exactly ${rules.squadSize} players.`);
  const totalCost = players.reduce((sum, p) => sum + p.priceTenths, 0);
  if (totalCost > rules.budgetTenths) errors.push("Squad exceeds the available budget.");
  for (const [position, required] of Object.entries(rules.required) as [Position, number][]) {
    const actual = players.filter(p => p.position === position).length;
    if (actual !== required) errors.push(`Squad must contain exactly ${required} ${position} players (currently ${actual}).`);
  }
  const clubCounts = new Map<string, number>();
  for (const player of players) clubCounts.set(player.clubId, (clubCounts.get(player.clubId) ?? 0) + 1);
  if ([...clubCounts.values()].some(count => count > rules.maxPerClub)) {
    errors.push(`A maximum of ${rules.maxPerClub} players is allowed from one club.`);
  }
  return errors;
}
