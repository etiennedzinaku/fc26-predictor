import { MODEL_CONFIG } from "./config.js";
import { weightedRecent } from "./statistics.js";

export function calculateRecentForm(matches, config = MODEL_CONFIG) {
  return weightedRecent(matches, ["gf", "ga", "htGf", "htGa"], config.recentWeights);
}