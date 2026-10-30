import { MODEL_CONFIG } from "./config.js";
import { calculateExpectedGoals } from "./expected-goals.js";
import { estimateHalfTimeLambdas } from "./halftime.js";
import { halftimeFulltimeCombinations, analyzePoissonMatch, combinePoissonPredictions } from "./poisson.js";
import { calculateTeamStrength } from "./team-strength.js";
import { expectedGoals } from "./statistics.js";
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
  const modelDefinitions = [
    {
      id: "season",
      label: "Saison uniquement",
      lambdas: expectedGoals(
        profileA.strength.season.goalsFor,
        profileB.strength.season.goalsAgainst,
        profileB.strength.season.goalsFor,
        profileA.strength.season.goalsAgainst,
      ),
    },
    {
      id: "recent",
      label: "Forme récente uniquement",
      lambdas: expectedGoals(
        profileA.strength.recent.gf,
        profileB.strength.recent.ga,
        profileB.strength.recent.gf,
        profileA.strength.recent.ga,
      ),
    },
    { id: "mixed", label: "Saison + forme (65/35)", lambdas: calculateExpectedGoals(profileA, profileB) },
  ];
  const modelWeightTotal = modelDefinitions.reduce((sum, model) => sum + config.modelWeights[model.id], 0);
  if (!Number.isFinite(modelWeightTotal) || modelWeightTotal <= 0) {
    throw new RangeError("At least one valid model weight is required.");
  }
  const models = modelDefinitions.map((definition) => {
    const weight = config.modelWeights[definition.id];
    const halfTime = estimateHalfTimeLambdas(profileA, profileB, definition.lambdas, config);
    return {
      ...definition,
      weight: weight / modelWeightTotal,
      fullTime: analyzePoissonMatch(definition.lambdas.teamA, definition.lambdas.teamB, config),
      halfTime: analyzePoissonMatch(halfTime.teamA, halfTime.teamB, config),
      halfTimeLambdas: { teamA: halfTime.teamA, teamB: halfTime.teamB },
      secondHalfLambdas: halfTime.secondHalf,
      halftimeEstimate: halfTime,
      halfTimeFullTime: halftimeFulltimeCombinations(
        { teamA: halfTime.teamA, teamB: halfTime.teamB }, halfTime.secondHalf, config,
      ),
    };
  });
  const modelWeights = models.map((model) => model.weight);
  const fullTimePrediction = combinePoissonPredictions(models.map((model) => model.fullTime), modelWeights, config);
  const halfTimePrediction = combinePoissonPredictions(models.map((model) => model.halfTime), modelWeights, config);
  const halfTimeFullTime = {
    probabilities: Object.fromEntries(Object.keys(models[0].halfTimeFullTime.probabilities).map((outcome) => [
      outcome,
      models.reduce((sum, model) => sum + model.weight * model.halfTimeFullTime.probabilities[outcome], 0),
    ])),
    massCovered: models.reduce((sum, model) => sum + model.weight * model.halfTimeFullTime.massCovered, 0),
  };
  halfTimeFullTime.tailMass = Math.max(0, 1 - halfTimeFullTime.massCovered);
  const fullTimeLambdas = { teamA: fullTimePrediction.lambdaA, teamB: fullTimePrediction.lambdaB };
  const halfTimeLambdas = { teamA: halfTimePrediction.lambdaA, teamB: halfTimePrediction.lambdaB };
  const halfTimeRatios = models[0].halftimeEstimate.ratios;
  const modelsForDisplay = models.map((model) => ({
    id: model.id,
    label: model.label,
    weight: model.weight,
    expectedGoals: model.lambdas,
    result: model.fullTime.result,
  }));

  return {
    modelVersion: config.modelVersion,
    analyzedAt: new Date().toISOString(),
    configuration: {
      seasonWeight: config.seasonWeight,
      recentWeight: config.recentWeight,
      recentWeights: [...config.recentWeights],
      modelWeights: { ...config.modelWeights },
      halftimePriorRatio: config.halftimePriorRatio,
      halftimeSmoothingGoals: config.halftimeSmoothingGoals,
      poissonTailTolerance: config.poissonTailTolerance,
      poissonMaxGoals: config.poissonMaxGoals,
    },
    teams: [profileA, profileB],
    models: modelsForDisplay,
    ensemble: { method: "equal-weight probability mixture", modelCount: models.length, calibrated: false },
    expectedGoals: { fullTime: fullTimeLambdas, halfTime: halfTimeLambdas },
    completeness: {
      status: "complete",
      recentMatchesAvailable: profileA.recentMatchCount + profileB.recentMatchCount,
      recentMatchesRequired: 6,
      teams: 2,
    },
    halfTime: { ...halfTimePrediction, confidence: "low", ratios: halfTimeRatios },
    fullTime: fullTimePrediction,
    halfTimeFullTime,
    assumptions: [
      "Les statistiques de saison et les trois derniers matchs sont combinés selon les pondérations configurées à 65/35.",
      "Les trois variantes Poisson sont mélangées à poids égaux ; ces poids n’ont pas été optimisés ni calibrés sur des résultats historiques.",
      "Les buts attendus sont la moyenne arithmétique de la force offensive d’une équipe et du taux de buts encaissés par son adversaire ; aucune moyenne de championnat n’est utilisée.",
      "Les buts de chaque période suivent des incréments de Poisson indépendants ; l’estimation de mi-temps est lissée à partir de trois matchs.",
      "Les probabilités sont des estimations, pas des garanties ; la confiance à la mi-temps est faible vu le petit échantillon.",
    ],
  };
}