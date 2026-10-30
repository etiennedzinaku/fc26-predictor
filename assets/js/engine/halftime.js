import { MODEL_CONFIG } from "./config.js?v=ensemble-3";

function smoothedPeriodRatio(halfTimeGoals, fullTimeGoals, config) {
  if (!Number.isFinite(halfTimeGoals) || !Number.isFinite(fullTimeGoals)
    || halfTimeGoals < 0 || fullTimeGoals < halfTimeGoals) {
    throw new RangeError("Half-time goals must be non-negative and no greater than full-time goals.");
  }
  const smoothingGoals = config.halftimeSmoothingGoals;
  const priorRatio = config.halftimePriorRatio;
  if (!Number.isFinite(smoothingGoals) || smoothingGoals < 0
    || !Number.isFinite(priorRatio) || priorRatio < 0 || priorRatio > 1) {
    throw new RangeError("Half-time smoothing settings are invalid.");
  }
  const ratio = (halfTimeGoals + priorRatio * smoothingGoals) / (fullTimeGoals + smoothingGoals);
  return Math.min(1, Math.max(0, ratio));
}

export function estimateHalfTimeLambdas(teamA, teamB, fullTimeLambdas, config = MODEL_CONFIG) {
  const attackRatioA = smoothedPeriodRatio(teamA.recent.htGf, teamA.recent.gf, config);
  const concedeRatioA = smoothedPeriodRatio(teamA.recent.htGa, teamA.recent.ga, config);
  const attackRatioB = smoothedPeriodRatio(teamB.recent.htGf, teamB.recent.gf, config);
  const concedeRatioB = smoothedPeriodRatio(teamB.recent.htGa, teamB.recent.ga, config);
  const teamAValue = Math.min(fullTimeLambdas.teamA,
    fullTimeLambdas.teamA * Math.sqrt(attackRatioA * concedeRatioB));
  const teamBValue = Math.min(fullTimeLambdas.teamB,
    fullTimeLambdas.teamB * Math.sqrt(attackRatioB * concedeRatioA));

  return {
    teamA: teamAValue,
    teamB: teamBValue,
    secondHalf: {
      teamA: fullTimeLambdas.teamA - teamAValue,
      teamB: fullTimeLambdas.teamB - teamBValue,
    },
    ratios: {
      teamAAttack: attackRatioA,
      teamAConcede: concedeRatioA,
      teamBAttack: attackRatioB,
      teamBConcede: concedeRatioB,
    },
    confidence: "low",
    sampleSize: 3,
  };
}