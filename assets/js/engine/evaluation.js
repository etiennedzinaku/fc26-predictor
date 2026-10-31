const OUTCOMES = ["1", "X", "2"];
const MODEL_IDS = ["season", "recent", "mixed"];

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

function actualOutcome(analysis, period) {
  const score = analysis.actualResult?.[period];
  if (!score || !Number.isInteger(score.teamA) || !Number.isInteger(score.teamB)
    || score.teamA < 0 || score.teamB < 0) return null;
  return score.teamA > score.teamB ? "1" : score.teamA < score.teamB ? "2" : "X";
}

function getModelProbabilities(analysis) {
  const models = analysis.output?.models;
  if (!Array.isArray(models)) return null;
  const byId = new Map(models.map((model) => [model.id, model]));
  if (MODEL_IDS.some((id) => !byId.has(id))) return null;
  return Object.fromEntries(MODEL_IDS.map((id) => {
    const result = byId.get(id).result;
    return [id, { "1": result.teamA / 100, X: result.draw / 100, "2": result.teamB / 100 }];
  }));
}

function blendModelProbabilities(modelProbabilities, weights) {
  return Object.fromEntries(OUTCOMES.map((outcome) => [outcome,
    MODEL_IDS.reduce((sum, id) => sum + weights[id] * modelProbabilities[id][outcome], 0),
  ]));
}

function generateWeightCandidates(step) {
  if (!Number.isFinite(step) || step <= 0 || step > 1 || Math.abs(1 / step - Math.round(1 / step)) > 1e-9) {
    throw new RangeError("weightStep must evenly divide one and be between zero and one.");
  }
  const divisions = Math.round(1 / step);
  const candidates = [];
  for (let season = 0; season <= divisions; season += 1) {
    for (let recent = 0; recent <= divisions - season; recent += 1) {
      const mixed = divisions - season - recent;
      candidates.push({ season: season / divisions, recent: recent / divisions, mixed: mixed / divisions });
    }
  }
  return candidates;
}

function selectWeights(trainingRecords, candidates) {
  let best = null;
  for (const weights of candidates) {
    const records = trainingRecords.map((record) => ({
      probabilities: blendModelProbabilities(record.models, weights),
      actual: record.actual,
    }));
    const metrics = evaluatePredictions(records);
    if (!best || metrics.logLoss < best.metrics.logLoss
      || (metrics.logLoss === best.metrics.logLoss && metrics.brierScore < best.metrics.brierScore)) {
      best = { weights, metrics };
    }
  }
  return best;
}

function evaluateObservedScores(analyses, period, scoreMatrixKey) {
  const records = [];
  let exactScoreLoss = 0;
  let exactScoreCount = 0;
  let goalsAbsoluteError = 0;
  let goalsErrorCount = 0;
  for (const analysis of analyses) {
    const actual = actualOutcome(analysis, period);
    const probabilities = period === "ft" ? analysis.output?.fullTime?.result : analysis.output?.halfTime?.result;
    if (actual && probabilities) {
      records.push({
        probabilities: { "1": probabilities.teamA / 100, X: probabilities.draw / 100, "2": probabilities.teamB / 100 },
        actual,
      });
    }

    const actualScore = analysis.actualResult?.[period];
    const prediction = analysis.output?.[scoreMatrixKey];
    if (!actualScore || !prediction?.matrix || !Number.isFinite(prediction.massCovered) || prediction.massCovered <= 0) continue;
    const matchingScore = prediction.matrix.find((score) => score.goalsA === actualScore.teamA && score.goalsB === actualScore.teamB);
    exactScoreLoss -= Math.log(Math.max(1e-15, (matchingScore?.probability ?? 0) / prediction.massCovered));
    exactScoreCount += 1;

    const expected = period === "ft" ? analysis.output.expectedGoals?.fullTime : analysis.output.expectedGoals?.halfTime;
    if (expected) {
      goalsAbsoluteError += (Math.abs(expected.teamA - actualScore.teamA) + Math.abs(expected.teamB - actualScore.teamB)) / 2;
      goalsErrorCount += 1;
    }
  }
  return {
    ...evaluatePredictions(records),
    exactScoreLogLoss: exactScoreCount ? exactScoreLoss / exactScoreCount : null,
    meanAbsoluteGoalsError: goalsErrorCount ? goalsAbsoluteError / goalsErrorCount : null,
  };
}

export function evaluateAnalysisArchive(analyses, options = {}) {
  if (!Array.isArray(analyses)) throw new TypeError("analyses must be an array.");
  const minimumTrainingMatches = options.minimumTrainingMatches ?? 5;
  if (!Number.isInteger(minimumTrainingMatches) || minimumTrainingMatches < 1) {
    throw new RangeError("minimumTrainingMatches must be a positive integer.");
  }

  const completed = analyses.filter((analysis) => actualOutcome(analysis, "ft") !== null);
  const fullTime = evaluateObservedScores(completed, "ft", "fullTime");
  const halfTime = evaluateObservedScores(completed, "ht", "halfTime");
  const chronological = completed.map((analysis) => ({
    analysis,
    actual: actualOutcome(analysis, "ft"),
    models: getModelProbabilities(analysis),
  })).filter((record) => record.models)
    .sort((left, right) => new Date(left.analysis.createdAt) - new Date(right.analysis.createdAt));
  const candidates = generateWeightCandidates(options.weightStep ?? 0.1);
  const walkForwardRecords = [];
  const weightsUsed = [];

  for (let index = minimumTrainingMatches; index < chronological.length; index += 1) {
    const testRecord = chronological[index];
    const predictionTimestamp = new Date(testRecord.analysis.createdAt).getTime();
    const training = chronological.slice(0, index).filter((record) => {
      const recordedAt = record.analysis.actualResult?.recordedAt;
      return recordedAt && new Date(recordedAt).getTime() <= predictionTimestamp;
    });
    if (training.length < minimumTrainingMatches) continue;
    const selected = selectWeights(training, candidates);
    walkForwardRecords.push({
      probabilities: blendModelProbabilities(testRecord.models, selected.weights),
      actual: testRecord.actual,
      analysisId: testRecord.analysis.id,
      trainingCount: training.length,
      weights: selected.weights,
    });
    weightsUsed.push(selected.weights);
  }

  const walkForwardMetrics = evaluatePredictions(walkForwardRecords);
  const averageWeights = Object.fromEntries(MODEL_IDS.map((id) => [id,
    weightsUsed.length ? weightsUsed.reduce((sum, weights) => sum + weights[id], 0) / weightsUsed.length : null,
  ]));

  return {
    completedCount: completed.length,
    fullTime,
    halfTime,
    walkForward: {
      minimumTrainingMatches,
      evaluatedCount: walkForwardRecords.length,
      metrics: walkForwardMetrics,
      averageWeights,
      records: walkForwardRecords,
      calibrated: false,
    },
  };
}