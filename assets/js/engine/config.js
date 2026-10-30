export const MODEL_CONFIG = Object.freeze({
  recentWeights: Object.freeze([0.5, 0.3, 0.2]),
  seasonWeight: 0.65,
  recentWeight: 0.35,
  halftimePriorRatio: 0.45,
  halftimeSmoothingGoals: 2,
  poissonTailTolerance: 1e-10,
  poissonMaxGoals: 250,
  exactScoresToShow: 5,
});