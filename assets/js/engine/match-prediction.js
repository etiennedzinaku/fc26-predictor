import { MODEL_CONFIG } from "./config.js";
import { calculateExpectedGoals } from "./expected-goals.js";
import { estimateHalfTimeLambdas } from "./halftime.js";
import { halftimeFulltimeCombinations, analyzePoissonMatch } from "./poisson.js";
import { calculateTeamStrength } from "./team-strength.js";
import { leagueGoalAverage } from "./statistics.js";

function createTeamProfile(team, config) {
  if (!team?.id || !team.championshipId || !team.standing) {
    throw new TypeError("Each team needs an id, a championship, and season standings.");
  }
  if (!Array.isArray(team.recentMatches) || team.recentMatches.length !== 3) {
    throw new RangeError(`${team.name ?? "Team"} must have exactly three complete recent matches.`);
  }
  const strength = calculateTeamStrength(team.standing, team.recentMatches, config);
  return {
    id: team.id,
    name: team.name,
    championshipId: team.championshipId,
    recentMatchCount: team.recentMatches.length,
    recent: strength.recent,
    strength,
  };
}

export function predictMatch({ teamA, teamB, standings = [], leagueAverage: suppliedLeagueAverage }, config = MODEL_CONFIG) {
  if (!teamA || !teamB || teamA.id === teamB.id) {
    throw new RangeError("Choose two distinct teams.");
  }
  if (teamA.championshipId !== teamB.championshipId) {
    throw new RangeError("Both teams must belong to the same championship.");
  }
  if (!Array.isArray(standings)) throw new TypeError("standings must be an array when supplied.");

  const profileA = createTeamProfile(teamA, config);
  const profileB = createTeamProfile(teamB, config);
  const leagueAverage = suppliedLeagueAverage ?? leagueGoalAverage(standings);
  if (!Number.isFinite(leagueAverage) || leagueAverage <= 0) {
    throw new RangeError("A finite positive league average is required.");
  }
  const fullTimeLambdas = calculateExpectedGoals(profileA, profileB, leagueAverage);
  const halfTime = estimateHalfTimeLambdas(profileA, profileB, fullTimeLambdas, config);
  const fullTimePrediction = analyzePoissonMatch(fullTimeLambdas.teamA, fullTimeLambdas.teamB, config);
  const halfTimePrediction = analyzePoissonMatch(halfTime.teamA, halfTime.teamB, config);
  const halfTimeFullTime = halftimeFulltimeCombinations(
    { teamA: halfTime.teamA, teamB: halfTime.teamB }, halfTime.secondHalf, config,
  );

  return {
    modelVersion: "1.0.0",
    analyzedAt: new Date().toISOString(),
    configuration: {
      seasonWeight: config.seasonWeight,
      recentWeight: config.recentWeight,
      recentWeights: [...config.recentWeights],
      halftimePriorRatio: config.halftimePriorRatio,
      halftimeSmoothingGoals: config.halftimeSmoothingGoals,
      poissonTailTolerance: config.poissonTailTolerance,
      poissonMaxGoals: config.poissonMaxGoals,
    },
    leagueAverage,
    teams: [profileA, profileB],
    expectedGoals: { fullTime: fullTimeLambdas, halfTime: { teamA: halfTime.teamA, teamB: halfTime.teamB } },
    completeness: {
      status: "complete",
      recentMatchesAvailable: profileA.recentMatchCount + profileB.recentMatchCount,
      recentMatchesRequired: 6,
      standingsTeams: standings.length,
    },
    halfTime: { ...halfTimePrediction, confidence: halfTime.confidence, ratios: halfTime.ratios },
    fullTime: fullTimePrediction,
    halfTimeFullTime,
    assumptions: [
      "Season rates and the three most recent matches are blended using the configured 65/35 weights.",
      "Goals in each period are independent Poisson increments; half-time estimates are smoothed from three matches.",
      "Probabilities are model estimates, not guarantees; half-time confidence is low because the recent sample is small.",
    ],
  };
}