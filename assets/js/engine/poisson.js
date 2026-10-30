import { MODEL_CONFIG } from "./config.js";

function validateLambda(lambda) {
  if (!Number.isFinite(lambda) || lambda < 0) {
    throw new TypeError("Poisson lambda must be a finite non-negative number.");
  }
  if (lambda > 700) {
    throw new RangeError("Poisson lambda is outside the numerically supported range (0-700).");
  }
}

export function poissonProbability(lambda, goals) {
  validateLambda(lambda);
  if (!Number.isInteger(goals) || goals < 0) {
    throw new RangeError("goals must be a non-negative integer.");
  }
  if (lambda === 0) return goals === 0 ? 1 : 0;
  let probability = Math.exp(-lambda);
  for (let count = 1; count <= goals; count += 1) {
    probability *= lambda / count;
  }
  return probability;
}

export function poissonDistribution(lambda, options = {}) {
  validateLambda(lambda);
  const tailTolerance = options.tailTolerance ?? options.poissonTailTolerance ?? MODEL_CONFIG.poissonTailTolerance;
  const maxGoals = options.maxGoals ?? options.poissonMaxGoals ?? MODEL_CONFIG.poissonMaxGoals;
  if (!Number.isFinite(tailTolerance) || tailTolerance <= 0 || tailTolerance >= 1) {
    throw new RangeError("tailTolerance must be between zero and one.");
  }
  if (!Number.isInteger(maxGoals) || maxGoals < 0) {
    throw new RangeError("maxGoals must be a non-negative integer.");
  }

  const probabilities = [];
  let probability = Math.exp(-lambda);
  let cumulative = 0;
  for (let goals = 0; goals <= maxGoals; goals += 1) {
    if (goals > 0) probability *= lambda / goals;
    probabilities.push(probability);
    cumulative += probability;
    if (goals >= lambda && 1 - cumulative <= tailTolerance) break;
  }
  const massCovered = Math.min(1, cumulative);
  return {
    probabilities,
    massCovered,
    tailMass: Math.max(0, 1 - massCovered),
    complete: 1 - massCovered <= tailTolerance,
  };
}

function classifyResult(goalsA, goalsB) {
  if (goalsA > goalsB) return "1";
  if (goalsA < goalsB) return "2";
  return "X";
}

export function analyzePoissonMatch(lambdaA, lambdaB, options = {}) {
  const distributionA = poissonDistribution(lambdaA, options);
  const distributionB = poissonDistribution(lambdaB, options);
  const rawCoverage = distributionA.massCovered * distributionB.massCovered;
  if (rawCoverage <= 0) throw new RangeError("The score matrix has no covered probability mass.");

  const matrix = [];
  const exactScores = [];
  const resultMass = { "1": 0, X: 0, "2": 0 };
  const totalsMass = new Map();
  let bttsYes = 0;

  distributionA.probabilities.forEach((probabilityA, goalsA) => {
    distributionB.probabilities.forEach((probabilityB, goalsB) => {
      const probability = probabilityA * probabilityB;
      if (probability === 0) return;
      matrix.push({ goalsA, goalsB, probability });
      exactScores.push({ goalsA, goalsB, probability: probability / rawCoverage });
      resultMass[classifyResult(goalsA, goalsB)] += probability;
      totalsMass.set(goalsA + goalsB, (totalsMass.get(goalsA + goalsB) ?? 0) + probability);
      if (goalsA > 0 && goalsB > 0) bttsYes += probability;
    });
  });

  const percentage = (mass) => (mass / rawCoverage) * 100;
  const overUnder = Object.fromEntries([1.5, 2.5, 3.5].map((line) => {
    const overMass = [...totalsMass.entries()]
      .filter(([total]) => total > line)
      .reduce((sum, [, mass]) => sum + mass, 0);
    const over = percentage(overMass);
    return [String(line), { over, under: 100 - over }];
  }));

  exactScores.sort((left, right) => right.probability - left.probability);
  return {
    lambdaA,
    lambdaB,
    matrix,
    massCovered: rawCoverage,
    tailMass: Math.max(0, 1 - rawCoverage),
    complete: distributionA.complete && distributionB.complete,
    result: {
      teamA: percentage(resultMass["1"]),
      draw: percentage(resultMass.X),
      teamB: percentage(resultMass["2"]),
    },
    overUnder,
    btts: { yes: percentage(bttsYes), no: percentage(rawCoverage - bttsYes) },
    exactScores: exactScores.slice(0, options.exactScoresToShow ?? MODEL_CONFIG.exactScoresToShow),
  };
}

function differenceDistribution(goalsA, goalsB) {
  const differences = new Map();
  goalsA.probabilities.forEach((probabilityA, scoreA) => {
    goalsB.probabilities.forEach((probabilityB, scoreB) => {
      const difference = scoreA - scoreB;
      differences.set(difference, (differences.get(difference) ?? 0) + probabilityA * probabilityB);
    });
  });
  return differences;
}

export function halftimeFulltimeCombinations(halfTimeLambdas, secondHalfLambdas, options = {}) {
  const halfTimeA = poissonDistribution(halfTimeLambdas.teamA, options);
  const halfTimeB = poissonDistribution(halfTimeLambdas.teamB, options);
  const secondHalfA = poissonDistribution(secondHalfLambdas.teamA, options);
  const secondHalfB = poissonDistribution(secondHalfLambdas.teamB, options);
  const halfTimeDifferences = differenceDistribution(halfTimeA, halfTimeB);
  const secondHalfDifferences = differenceDistribution(secondHalfA, secondHalfB);
  const combinations = Object.fromEntries(["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"]
    .map((key) => [key, 0]));

  halfTimeDifferences.forEach((halfMass, halfDifference) => {
    secondHalfDifferences.forEach((secondMass, secondDifference) => {
      const halfOutcome = halfDifference > 0 ? "1" : halfDifference < 0 ? "2" : "X";
      const finalDifference = halfDifference + secondDifference;
      const finalOutcome = finalDifference > 0 ? "1" : finalDifference < 0 ? "2" : "X";
      combinations[`${halfOutcome}/${finalOutcome}`] += halfMass * secondMass;
    });
  });

  const massCovered = halfTimeA.massCovered * halfTimeB.massCovered
    * secondHalfA.massCovered * secondHalfB.massCovered;
  if (massCovered <= 0) throw new RangeError("The HT/FT combinations have no covered probability mass.");
  for (const key of Object.keys(combinations)) {
    combinations[key] = (combinations[key] / massCovered) * 100;
  }
  return {
    probabilities: combinations,
    massCovered,
    tailMass: Math.max(0, 1 - massCovered),
  };
}