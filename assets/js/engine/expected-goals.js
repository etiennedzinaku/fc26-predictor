import { expectedGoals } from "./statistics.js?v=ensemble-3";

export function calculateExpectedGoals(teamA, teamB) {
  return expectedGoals(teamA.strength.attack, teamB.strength.defense,
    teamB.strength.attack, teamA.strength.defense);
}