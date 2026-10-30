import { MODEL_CONFIG } from "./config.js";

function requireFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
}

export function validateStanding(standing) {
  const fields = ["mp", "wins", "draws", "losses", "gf", "ga", "points"];
  const errors = [];

  for (const field of fields) {
    const value = Number(standing[field]);
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`${field} must be a non-negative integer.`);
    }
  }

  if (errors.length > 0) return errors;
  if (standing.mp !== standing.wins + standing.draws + standing.losses) {
    errors.push("Played matches do not equal wins + draws + losses.");
  }
  if (standing.points !== 3 * standing.wins + standing.draws) {
    errors.push("Points do not match the 3-1-0 scoring rule.");
  }
  return errors;
}

export function seasonAverages({ gf, ga, mp }) {
  requireFiniteNonNegative(gf, "gf");
  requireFiniteNonNegative(ga, "ga");
  if (!Number.isInteger(mp) || mp <= 0) {
    throw new RangeError("mp must be a positive integer.");
  }
  return { goalsFor: gf / mp, goalsAgainst: ga / mp };
}

export function weightedRecent(matches, fields, weights = MODEL_CONFIG.recentWeights) {
  if (!Array.isArray(matches) || matches.length !== weights.length || weights.length === 0) {
    throw new RangeError(`Exactly ${weights.length} recent matches are required.`);
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TypeError("At least one statistic field is required.");
  }
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(weightTotal) || weightTotal <= 0 || weights.some((weight) => weight < 0)) {
    throw new RangeError("Recent-match weights must be non-negative and have a positive sum.");
  }

  return Object.fromEntries(fields.map((field) => {
    const value = matches.reduce((sum, match, index) => {
      const current = Number(match[field]);
      requireFiniteNonNegative(current, field);
      return sum + current * weights[index];
    }, 0) / weightTotal;
    return [field, value];
  }));
}

export function blendStrength(seasonRate, recentRate, config = MODEL_CONFIG) {
  requireFiniteNonNegative(seasonRate, "seasonRate");
  requireFiniteNonNegative(recentRate, "recentRate");
  const totalWeight = config.seasonWeight + config.recentWeight;
  if (config.seasonWeight < 0 || config.recentWeight < 0 || totalWeight <= 0) {
    throw new RangeError("Strength weights must be non-negative with a positive sum.");
  }
  const strength = (seasonRate * config.seasonWeight + recentRate * config.recentWeight) / totalWeight;
  if (!Number.isFinite(strength)) throw new RangeError("Blended team strength is outside the numerical range.");
  return strength;
}

export function leagueGoalAverage(standings) {
  if (!Array.isArray(standings) || standings.length === 0) {
    throw new RangeError("At least one standing is required to calculate the league average.");
  }
  const errors = standings.flatMap((standing) => validateStanding(standing));
  if (errors.length > 0) {
    throw new RangeError(`Incoherent league standings: ${errors.join(" ")}`);
  }

  const totalGoalsFor = standings.reduce((sum, standing) => sum + standing.gf, 0);
  const totalMatchesPlayed = standings.reduce((sum, standing) => sum + standing.mp, 0);
  const totalGoalsAgainst = standings.reduce((sum, standing) => sum + standing.ga, 0);
  if (totalGoalsFor !== totalGoalsAgainst) {
    throw new RangeError("League goals for and goals against totals do not match.");
  }
  if (totalMatchesPlayed <= 0) {
    throw new RangeError("League matches played must be greater than zero.");
  }
  return totalGoalsFor / totalMatchesPlayed;
}

export function expectedGoals(attackA, defenseB, attackB, defenseA, leagueAverage) {
  for (const [label, value] of Object.entries({ attackA, defenseB, attackB, defenseA })) {
    requireFiniteNonNegative(value, label);
  }
  if (!Number.isFinite(leagueAverage) || leagueAverage <= 0) {
    throw new RangeError("leagueAverage must be finite and greater than zero.");
  }
  const result = {
    teamA: (attackA * defenseB) / leagueAverage,
    teamB: (attackB * defenseA) / leagueAverage,
  };
  if (!Number.isFinite(result.teamA) || !Number.isFinite(result.teamB)) {
    throw new RangeError("Expected goals are outside the numerical range.");
  }
  return result;
}