import { escapeHtml, formatDate, formatPercent } from "../ui.js";

export function renderDashboard(analyses) {
  const uniqueTeams = new Set(analyses.flatMap((analysis) => analysis.output.teams.map((team) => team.name)));
  const uniqueChampionships = new Set(analyses.map((analysis) => analysis.championshipName));
  const metrics = [
    ["ANALYSES", analyses.length, "Calculs sauvegardés localement"],
    ["ÉQUIPES", uniqueTeams.size, "Équipes analysées"],
    ["CHAMPIONNATS", uniqueChampionships.size, "Compétitions comparées"],
    ["DERNIÈRE ANALYSE", analyses.length ? formatDate(analyses[0].createdAt) : "—", "Sur cet appareil"],
  ];
  document.querySelector("#overview-metrics").innerHTML = metrics.map(([label, value, detail], index) => `
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

  document.querySelector("#evaluation-summary").textContent = analyses.length
    ? `${analyses.length} analyse(s) sauvegardée(s). L’évaluation Brier et Log Loss sera ajoutée avec la saisie des scores réels.`
    : "Lance une analyse pour voir tes indicateurs ici.";
}
