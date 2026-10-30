import test from "node:test";
import assert from "node:assert/strict";
import { blendStrength, expectedGoals, leagueGoalAverage, seasonAverages, weightedRecent } from "../assets/js/engine/statistics.js";
import { analyzePoissonMatch, poissonDistribution, poissonProbability } from "../assets/js/engine/poisson.js";
import { estimateHalfTimeLambdas } from "../assets/js/engine/halftime.js";
import { halftimeFulltimeCombinations } from "../assets/js/engine/poisson.js";
import { predictMatch } from "../assets/js/engine/match-prediction.js";
import { analyzeOdds, normalizeImpliedProbabilities } from "../assets/js/engine/odds-analysis.js";
import { evaluatePredictions } from "../assets/js/engine/evaluation.js";
import { deleteAnalysis, importArchive, readAnalyses, saveAnalysis, serializeArchive } from "../assets/js/analysis-store.js";

const localValues = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key),
  },
});

test("season averages use matches played as denominator", () => {
  assert.deepEqual(seasonAverages({ gf: 18, ga: 9, mp: 6 }), { goalsFor: 3, goalsAgainst: 1.5 });
});

test("recent form applies 50/30/20 from newest to oldest", () => {
  assert.deepEqual(weightedRecent([{ gf: 4 }, { gf: 2 }, { gf: 1 }], ["gf"]), { gf: 2.8000000000000003 });
});

test("attack and defense strengths blend season and recent rates", () => {
  assert.equal(blendStrength(2, 4), 2.7);
});

test("league average uses total goals divided by total team matches", () => {
  const standings = [
    { mp: 2, wins: 1, draws: 0, losses: 1, gf: 3, ga: 2, points: 3 },
    { mp: 2, wins: 1, draws: 0, losses: 1, gf: 2, ga: 3, points: 3 },
  ];
  assert.equal(leagueGoalAverage(standings), 1.25);
});

test("incoherent standings block league-average calculation", () => {
  assert.throws(() => leagueGoalAverage([
    { mp: 2, wins: 1, draws: 0, losses: 0, gf: 2, ga: 1, points: 3 },
  ]), /Incoherent league standings/);
});

test("expected goals are derived from attack, opposing defense, and league average", () => {
  assert.deepEqual(expectedGoals(2, 1.5, 1, 2, 1.5), { teamA: 2, teamB: 1.3333333333333333 });
  assert.throws(() => expectedGoals(1, 1, 1, 1, 0), /scoringBaseline/);
  assert.throws(() => expectedGoals(Number.MAX_VALUE, Number.MAX_VALUE, 1, 1, Number.MIN_VALUE), /numerical range/);
});

test("Poisson probabilities and covered mass are valid", () => {
  assert.equal(poissonProbability(0, 0), 1);
  assert.equal(poissonProbability(0, 2), 0);
  const distribution = poissonDistribution(2.4);
  assert.equal(distribution.complete, true);
  assert.ok(Math.abs(distribution.massCovered - 1) < 1e-9);
  assert.throws(() => poissonProbability(-1, 0), /lambda/);
});

test("truncated Poisson distribution reports uncovered tail mass", () => {
  const distribution = poissonDistribution(4, { maxGoals: 1, tailTolerance: 1e-12 });
  assert.equal(distribution.complete, false);
  assert.ok(distribution.tailMass > 0.5);
});

test("1X2, totals, and BTTS probabilities are normalized", () => {
  const prediction = analyzePoissonMatch(1.7, 0.9);
  assert.equal(prediction.complete, true);
  assert.ok(Math.abs(prediction.result.teamA + prediction.result.draw + prediction.result.teamB - 100) < 1e-9);
  for (const market of Object.values(prediction.overUnder)) {
    assert.ok(Math.abs(market.over + market.under - 100) < 1e-9);
  }
  assert.ok(Math.abs(prediction.btts.yes + prediction.btts.no - 100) < 1e-9);
  assert.ok(prediction.exactScores.every((score) => score.probability >= 0 && score.probability <= 1));
});

test("half-time expected goals stay between zero and full-time expectations", () => {
  const teamA = { recent: { htGf: 0, gf: 0, htGa: 1, ga: 2 } };
  const teamB = { recent: { htGf: 1, gf: 2, htGa: 0, ga: 0 } };
  const estimate = estimateHalfTimeLambdas(teamA, teamB, { teamA: 1.4, teamB: 0.8 });
  assert.ok(estimate.teamA >= 0 && estimate.teamA <= 1.4);
  assert.ok(estimate.teamB >= 0 && estimate.teamB <= 0.8);
  assert.equal(estimate.secondHalf.teamA + estimate.teamA, 1.4);
  assert.equal(estimate.confidence, "low");
  assert.throws(() => estimateHalfTimeLambdas(
    { recent: { htGf: 2, gf: 1, htGa: 0, ga: 0 } }, teamB, { teamA: 1, teamB: 1 },
  ), /no greater than full-time/);
});

test("HT/FT combinations are normalized and reproduce the period model", () => {
  const halfTimeLambdas = { teamA: 0.7, teamB: 0.4 };
  const secondHalfLambdas = { teamA: 0.8, teamB: 0.5 };
  const combinations = halftimeFulltimeCombinations(halfTimeLambdas, secondHalfLambdas);
  const total = Object.values(combinations.probabilities).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 100) < 1e-8);
  assert.equal(Object.keys(combinations.probabilities).length, 9);
  const halfTime = analyzePoissonMatch(halfTimeLambdas.teamA, halfTimeLambdas.teamB);
  const fullTime = analyzePoissonMatch(halfTimeLambdas.teamA + secondHalfLambdas.teamA,
    halfTimeLambdas.teamB + secondHalfLambdas.teamB);
  const firstHalfWin = combinations.probabilities["1/1"] + combinations.probabilities["1/X"] + combinations.probabilities["1/2"];
  const finalWin = combinations.probabilities["1/1"] + combinations.probabilities["X/1"] + combinations.probabilities["2/1"];
  assert.ok(Math.abs(firstHalfWin - halfTime.result.teamA) < 1e-8);
  assert.ok(Math.abs(finalWin - fullTime.result.teamA) < 1e-8);
});

test("complete match prediction is deterministic and rejects missing or mismatched data", () => {
  const standingA = { mp: 10, wins: 6, draws: 2, losses: 2, gf: 18, ga: 12, points: 20 };
  const standingB = { mp: 10, wins: 5, draws: 1, losses: 4, gf: 12, ga: 18, points: 16 };
  const match = (gf, ga, htGf, htGa) => ({ gf, ga, htGf, htGa });
  const input = {
    teamA: { id: "a", championshipId: "league", name: "A", standing: standingA,
      recentMatches: [match(2, 0, 1, 0), match(1, 1, 0, 1), match(3, 1, 1, 0)] },
    teamB: { id: "b", championshipId: "league", name: "B", standing: standingB,
      recentMatches: [match(1, 0, 1, 0), match(0, 2, 0, 1), match(2, 1, 1, 0)] },
  };
  const first = predictMatch(input);
  const second = predictMatch(input);
  assert.deepEqual(first.fullTime.result, second.fullTime.result);
  assert.ok(Math.abs(Object.values(first.halfTimeFullTime.probabilities)
    .reduce((sum, value) => sum + value, 0) - 100) < 1e-8);
  assert.equal(first.scoringBaseline, 1.5);
  assert.ok(first.assumptions.some((assumption) => assumption.includes("not the championship-wide average")));
  assert.throws(() => predictMatch({ ...input, teamB: { ...input.teamB, championshipId: "other" } }), /same championship/);
  assert.throws(() => predictMatch({ ...input, teamA: { ...input.teamA, recentMatches: [] } }), /three complete/);
  const noSeasonGoals = {
    ...input,
    teamA: { ...input.teamA, standing: { ...standingA, gf: 0 } },
    teamB: { ...input.teamB, standing: { ...standingB, gf: 0 } },
  };
  assert.throws(() => predictMatch(noSeasonGoals), /scoring baseline/);
});

test("odds analysis separates raw implied probabilities from normalized probabilities", () => {
  const result = normalizeImpliedProbabilities([2, 3.5, 4]);
  assert.ok(result.overround > 0);
  assert.ok(Math.abs(result.normalized.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.deepEqual(analyzeOdds(0.5, 2), {
    fairOdds: 2,
    expectedValue: 0,
    impliedProbability: 0.5,
  });
  assert.throws(() => analyzeOdds(0.5, 1), /greater than 1/);
});

test("model evaluation reports Brier, log loss, accuracy, and calibration", () => {
  const metrics = evaluatePredictions([
    { probabilities: { "1": 0.7, X: 0.2, "2": 0.1 }, actual: "1" },
    { probabilities: { "1": 0.2, X: 0.6, "2": 0.2 }, actual: "2" },
  ]);
  assert.equal(metrics.count, 2);
  assert.ok(metrics.brierScore >= 0 && metrics.brierScore <= 2);
  assert.ok(metrics.logLoss > 0);
  assert.equal(metrics.accuracy, 0.5);
  assert.ok(metrics.calibration.length > 0);
  assert.throws(() => evaluatePredictions([{ probabilities: { "1": 0.8, X: 0.3, "2": 0 }, actual: "1" }]), /sum to one/);
});

test("JSON archive saves locally, merges by id, and deletes an analysis", async () => {
  const first = {
    id: "analysis-one",
    createdAt: "2026-10-30T10:00:00.000Z",
    output: { teams: [{ name: "A" }, { name: "B" }], fullTime: { result: { teamA: 40, draw: 30, teamB: 30 } } },
  };
  const second = { ...first, id: "analysis-two", createdAt: "2026-10-30T11:00:00.000Z" };
  localStorage.removeItem("fc26-predictor.analyses.v1");
  await saveAnalysis(first);
  const imported = await importArchive({ text: async () => JSON.stringify({
    app: "fc26-predictor-analyses", version: 1, analyses: [first, second],
  }) });
  assert.equal(imported.importedCount, 2);
  assert.equal(readAnalyses().length, 2);
  assert.equal(JSON.parse(serializeArchive()).analyses.length, 2);
  await deleteAnalysis("analysis-one");
  assert.deepEqual(readAnalyses().map((analysis) => analysis.id), ["analysis-two"]);
});

test("JSON archive rejects unknown formats and malformed analysis records", async () => {
  await assert.rejects(importArchive({ text: async () => JSON.stringify({ app: "other", version: 1, analyses: [] }) }), /archive FC26 Predictor reconnue/);
  await assert.rejects(importArchive({ text: async () => "{" }), SyntaxError);
});