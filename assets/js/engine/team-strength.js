import { blendStrength, seasonAverages } from "./statistics.js";
import { calculateRecentForm } from "./recent-form.js";

export function calculateTeamStrength(standing, recentMatches, config) {
  const season = seasonAverages({ gf: standing.gf, ga: standing.ga, mp: standing.mp });
  const recent = calculateRecentForm(recentMatches, config);
  return {
    season,
    recent,
    attack: blendStrength(season.goalsFor, recent.gf, config),
    defense: blendStrength(season.goalsAgainst, recent.ga, config),
  };
}