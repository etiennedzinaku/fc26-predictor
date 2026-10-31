import { escapeHtml, formatDate, formatPercent } from "../ui.js";
import { evaluateAnalysisArchive } from "../engine/evaluation.js?v=learning-5";

export function renderDashboard(analyses) {
  const uniqueTeams = new Set(analyses.flatMap((analysis) => analysis.output.teams.map((team) => team.name)));
  const uniqueChampionships = new Set(analyses.map((analysis) => analysis.championshipName));
  const overviewMetrics = [
    ["ANALYSES", analyses.length, "Calculs sauvegardés localement"],
    ["ÉQUIPES", uniqueTeams.size, "Équipes analysées"],
    ["CHAMPIONNATS", uniqueChampionships.size, "Compétitions comparées"],
    ["DERNIÈRE ANALYSE", analyses.length ? formatDate(analyses[0].createdAt) : "—", "Sur cet appareil"],
  ];
  document.querySelector("#overview-metrics").innerHTML = overviewMetrics.map(([label, value, detail], index) => `
    <article class="metric-card ${index === 0 ? "metric-card--accent" : ""}">
      <span class="metric-label">${label}</span><strong class="metric-value ${index === 3 ? "metric-value--date" : ""}">${escapeHtml(value)}</strong><span class="metric-detail">${detail}</span>
    </article>`).join("");

  const recent = analyses.slice(0, 5);
  document.querySelector("#overview-predictions").innerHTML = recent.length
    ? recent.map((analysis) => {
      const [teamA, teamB] = analysis.output.teams;
      const topScore = analysis.output.fullTime.exactScores[0];
      return `<div class="compact-item"><span><strong>${escapeHtml(teamA.name)} – ${escapeHtml(teamB.name)}</strong><small>${escapeHtml(analysis.championshipName)} · ${formatDate(analysis.createdAt)}</small></span><b class="compact-score">${topScore.goalsA}–${topScore.goalsB}</b></div>`;
    }).join("")
    : `<div class="empty-state"><strong>Aucune analyse pour le moment</strong>Lance une analyse pour remplir ton dashboard.</div>`;

  const evaluation = evaluateAnalysisArchive(analyses);
  const metrics = evaluation.fullTime;
  const walkForward = evaluation.walkForward;
  const metricValue = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : "—";
  const calibration = metrics.calibration.length
    ? metrics.calibration.map((bin) => `<span>${formatPercent(bin.meanPredicted * 100)} → ${formatPercent(bin.observedFrequency * 100)} <small>n=${bin.count}</small></span>`).join("")
    : "Aucune donnée de calibration.";
  const walkForwardText = walkForward.evaluatedCount
    ? `<div class="evaluation-metrics"><span>Tests hors-échantillon <strong>${walkForward.evaluatedCount}</strong></span><span>Brier <strong>${metricValue(walkForward.metrics.brierScore)}</strong></span><span>Log Loss <strong>${metricValue(walkForward.metrics.logLoss)}</strong></span><span>Justesse <strong>${formatPercent(walkForward.metrics.accuracy * 100)}</strong></span></div><p>Poids moyens testés (pas appliqués) : saison ${formatPercent(walkForward.averageWeights.season * 100)}, forme ${formatPercent(walkForward.averageWeights.recent * 100)}, mixte ${formatPercent(walkForward.averageWeights.mixed * 100)}.</p>`
    : `<p>Backtest en attente : il faut au moins ${walkForward.minimumTrainingMatches} scores saisis avant une prédiction ultérieure, puis un match à tester.</p>`;
  document.querySelector("#evaluation-summary").innerHTML = `<p>${evaluation.completedCount} analyse(s) avec score réel sur ${analyses.length}.</p>
    <div class="evaluation-metrics"><span>Brier 1X2 <strong>${metricValue(metrics.brierScore)}</strong></span><span>Log Loss 1X2 <strong>${metricValue(metrics.logLoss)}</strong></span><span>Justesse <strong>${metrics.accuracy === null ? "—" : formatPercent(metrics.accuracy * 100)}</strong></span><span>Log Loss score exact <strong>${metricValue(metrics.exactScoreLogLoss)}</strong></span><span>Erreur absolue buts attendus <strong>${metricValue(metrics.meanAbsoluteGoalsError, 2)}</strong></span></div>
    <p class="calibration-summary"><strong>Calibration</strong> · probabilité prévue → fréquence observée : ${calibration}</p>
    <div class="walk-forward-summary"><strong>Backtest chronologique · non appliqué au modèle</strong>${walkForwardText}</div>
    <p class="fine-print">Les métriques historiques décrivent les analyses enregistrées. Les poids du backtest sont choisis uniquement avec des analyses antérieures à chaque match évalué ; ils ne changent pas les prédictions ni les poids actifs.</p>`;
}
