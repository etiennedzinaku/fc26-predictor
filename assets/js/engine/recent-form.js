import { MODEL_CONFIG } from "./config.js?v=ensemble-3";
import { weightedRecent } from "./statistics.js?v=ensemble-3";

export function calculateRecentForm(matches, config = MODEL_CONFIG) {
  return weightedRecent(matches, ["gf", "ga", "htGf", "htGa"], config.recentWeights);
}