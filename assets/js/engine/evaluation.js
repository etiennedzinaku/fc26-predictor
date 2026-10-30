const OUTCOMES = ["1", "X", "2"];

export function evaluatePredictions(records, options = {}) {
  const binCount = options.binCount ?? 10;
  const epsilon = options.epsilon ?? 1e-15;
  if (!Number.isInteger(binCount) || binCount < 1) throw new RangeError("binCount must be a positive integer.");
  if (!Number.isFinite(epsilon) || epsilon <= 0 || epsilon >= 1) throw new RangeError("epsilon must be between zero and one.");
  if (!Array.isArray(records)) throw new TypeError("records must be an array.");
  if (records.length === 0) return { count: 0, brierScore: null, logLoss: null, accuracy: null, calibration: [] };

  const bins = Array.from({ length: binCount }, () => ({ count: 0, predictedTotal: 0, observedTotal: 0 }));
  let brierTotal = 0;
  let logLossTotal = 0;
  let correctTotal = 0;

  for (const record of records) {
    const probabilities = record.probabilities;
    if (!probabilities || OUTCOMES.some((outcome) => !Number.isFinite(probabilities[outcome])
      || probabilities[outcome] < 0 || probabilities[outcome] > 1)) {
      throw new RangeError("Each record needs 1X2 probabilities between zero and one.");
    }
    const total = OUTCOMES.reduce((sum, outcome) => sum + probabilities[outcome], 0);
    if (Math.abs(total - 1) > 1e-8) throw new RangeError("Each record’s 1X2 probabilities must sum to one.");
    if (!OUTCOMES.includes(record.actual)) throw new RangeError("Actual outcome must be 1, X, or 2.");

    let brier = 0;
    for (const outcome of OUTCOMES) {
      const observed = outcome === record.actual ? 1 : 0;
      const difference = probabilities[outcome] - observed;
      brier += difference * difference;
      const index = Math.min(binCount - 1, Math.floor(probabilities[outcome] * binCount));
      bins[index].count += 1;
      bins[index].predictedTotal += probabilities[outcome];
      bins[index].observedTotal += observed;
    }
    brierTotal += brier;
    logLossTotal -= Math.log(Math.max(epsilon, probabilities[record.actual]));
    const predicted = OUTCOMES.reduce((best, outcome) =>
      probabilities[outcome] > probabilities[best] ? outcome : best, OUTCOMES[0]);
    if (predicted === record.actual) correctTotal += 1;
  }

  return {
    count: records.length,
    brierScore: brierTotal / records.length,
    logLoss: logLossTotal / records.length,
    accuracy: correctTotal / records.length,
    calibration: bins.filter((bin) => bin.count > 0).map((bin) => ({
      count: bin.count,
      meanPredicted: bin.predictedTotal / bin.count,
      observedFrequency: bin.observedTotal / bin.count,
    })),
  };
}