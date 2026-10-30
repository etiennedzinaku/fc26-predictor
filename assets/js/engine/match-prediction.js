import { MODEL_CONFIG } from "./config.js";
import { calculateExpectedGoals } from "./expected-goals.js";
import { estimateHalfTimeLambdas } from "./halftime.js";
import { halftimeFulltimeCombinations, analyzePoissonMatch } from "./poisson.js";
import { calculateTeamStrength } from "./team-strength.js";
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

export function predictMatch({ teamA, teamB }, config = MODEL_CONFIG) {
  if (!teamA || !teamB || teamA.id === teamB.id) {
    throw new RangeError("Choose two distinct teams.");
  }
  if (teamA.championshipId !== teamB.championshipId) {
    throw new RangeError("Both teams must belong to the same championship.");
  }
  const profileA = createTeamProfile(teamA, config);
  const profileB = createTeamProfile(teamB, config);
  const fullTimeLambdas = calculateExpectedGoals(profileA, profileB);
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
    teams: [profileA, profileB],
    expectedGoals: { fullTime: fullTimeLambdas, halfTime: { teamA: halfTime.teamA, teamB: halfTime.teamB } },
    completeness: {
      status: "complete",
      recentMatchesAvailable: profileA.recentMatchCount + profileB.recentMatchCount,
      recentMatchesRequired: 6,
      teams: 2,
    },
    halfTime: { ...halfTimePrediction, confidence: halfTime.confidence, ratios: halfTime.ratios },
    fullTime: fullTimePrediction,
    halfTimeFullTime,
    assumptions: [
      "Les statistiques de saison et les trois derniers matchs sont combinés selon les pondérations configurées à 65/35.",
      "Les buts attendus sont la moyenne arithmétique de la force offensive d’une équipe et du taux de buts encaissés par son adversaire ; aucune moyenne de championnat n’est utilisée.",
      "Les buts de chaque période suivent des incréments de Poisson indépendants ; l’estimation de mi-temps est lissée à partir de trois matchs.",
      "Les probabilités sont des estimations, pas des garanties ; la confiance à la mi-temps est faible vu le petit échantillon.",
    ],
  };
}