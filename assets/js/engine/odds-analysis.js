function validateOdds(odds) {
  if (!Number.isFinite(odds) || odds <= 1) {
    throw new RangeError("Decimal odds must be a finite number greater than 1.");
  }
}

export function analyzeOdds(modelProbability, decimalOdds) {
  if (!Number.isFinite(modelProbability) || modelProbability < 0 || modelProbability > 1) {
    throw new RangeError("Model probability must be between zero and one.");
  }
  validateOdds(decimalOdds);
  return {
    fairOdds: modelProbability > 0 ? 1 / modelProbability : null,
    expectedValue: modelProbability * decimalOdds - 1,
    impliedProbability: 1 / decimalOdds,
  };
}

export function normalizeImpliedProbabilities(odds) {
  if (!Array.isArray(odds) || odds.length < 2) {
    throw new RangeError("At least two decimal odds are required to estimate bookmaker margin.");
  }
  odds.forEach(validateOdds);
  const implied = odds.map((decimalOdds) => 1 / decimalOdds);
  const total = implied.reduce((sum, probability) => sum + probability, 0);
  return {
    raw: implied,
    normalized: implied.map((probability) => probability / total),
    overround: total - 1,
  };
}