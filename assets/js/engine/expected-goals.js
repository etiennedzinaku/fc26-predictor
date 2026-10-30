import { expectedGoals } from "./statistics.js";

export function calculateExpectedGoals(teamA, teamB, scoringBaseline) {
  return expectedGoals(teamA.strength.attack, teamB.strength.defense,
    teamB.strength.attack, teamA.strength.defense, scoringBaseline);
}