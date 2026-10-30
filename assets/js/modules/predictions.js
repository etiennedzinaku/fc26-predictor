import { escapeHtml, formatDate, formatPercent } from "../ui.js";

function renderBars(result) {
  return [["1", result.teamA], ["X", result.draw], ["2", result.teamB]].map(([label, value]) => `
    <div class="probability-row"><span>${label}</span><div class="probability-track"><div class="probability-fill" style="width:${Math.max(0, Math.min(100, value))}%"></div></div><strong>${formatPercent(value)}</strong></div>`).join("");
}

function renderExactScores(scores) {
  return `<div class="score-alternatives">${scores.map((score) => `<span class="score-chip">${score.goalsA}–${score.goalsB} · ${formatPercent(score.probability * 100)}</span>`).join("")}</div>`;
}

function renderPeriodPanel(title, prediction, teamAName, teamBName, includeBtts) {
  const favorite = prediction.exactScores[0];
  const markets = ["1.5", "2.5", "3.5"].map((line) => `<div class="market-cell"><small>O/U ${line}</small><strong>${formatPercent(prediction.overUnder[line].over)} / ${formatPercent(prediction.overUnder[line].under)}</strong></div>`).join("");
  return `<article class="result-panel"><h3>${title}</h3><p class="panel-caption">${escapeHtml(teamAName)} / ${escapeHtml(teamBName)}</p>
    <div class="score-favorite"><strong>${favorite.goalsA}–${favorite.goalsB}</strong><span>Score modal · ${formatPercent(favorite.probability * 100)}</span></div>
    <div class="probability-bars">${renderBars(prediction.result)}</div>
    <div class="market-grid">${markets}</div>
    ${includeBtts ? `<div class="btts-row">BTTS Oui ${formatPercent(prediction.btts.yes)} <span>·</span> Non ${formatPercent(prediction.btts.no)}</div>` : ""}
    <div class="fine-print">Scores exacts les plus probables</div>${renderExactScores(prediction.exactScores)}
    ${prediction.complete ? "" : `<p class="coverage-note">Masse couverte : ${formatPercent(prediction.massCovered * 100)}. Les probabilités 1X2 sont conditionnelles à cette masse.</p>`}
    </article>`;
}

export function renderPredictionResult(output, teams, saved, championshipName) {
  const container = document.querySelector("#analysis-result");
  const [teamA, teamB] = teams;
  const top = output.fullTime.exactScores[0];
  const mostLikelyOutcome = [
    { label: `Victoire de ${teamA.name}`, probability: output.fullTime.result.teamA },
    { label: "Match nul", probability: output.fullTime.result.draw },
    { label: `Victoire de ${teamB.name}`, probability: output.fullTime.result.teamB },
  ].sort((left, right) => right.probability - left.probability)[0];
  const combinations = Object.entries(output.halfTimeFullTime.probabilities).map(([label, value]) => `<div class="combination-cell"><span>${label}</span><strong>${formatPercent(value)}</strong></div>`).join("");
  const modelRows = output.models.map((model) => `<tr><td>${escapeHtml(model.label)}</td><td>${formatPercent(model.result.teamA)}</td><td>${formatPercent(model.result.draw)}</td><td>${formatPercent(model.result.teamB)}</td><td>${formatPercent(model.weight * 100)}</td></tr>`).join("");
  container.innerHTML = `<div class="prediction-result">
    <header class="result-header"><div><p class="eyebrow">${saved ? "ANALYSE ENREGISTRÉE" : "ANALYSE NON ENREGISTRÉE"} · ${escapeHtml(output.modelVersion)}</p>
      <h2>${escapeHtml(teamA.name)} <span class="muted">vs</span> ${escapeHtml(teamB.name)}</h2><p>${escapeHtml(championshipName)} · ${formatDate(output.analyzedAt)} · ${output.completeness.recentMatchesAvailable}/6 matchs récents</p><p>xG calculés sans moyenne de championnat</p></div>
      <div class="result-xg"><div><span>xG ${escapeHtml(teamA.name)}</span><strong>${output.expectedGoals.fullTime.teamA.toFixed(2)}</strong></div><div><span>xG ${escapeHtml(teamB.name)}</span><strong>${output.expectedGoals.fullTime.teamB.toFixed(2)}</strong></div></div></header>
    ${saved ? "" : `<div class="load-error">L’analyse est calculée mais n’a pas pu être sauvegardée dans le navigateur.</div>`}
    <section class="winner-callout"><div><p class="eyebrow">ISSUE LA PLUS PROBABLE · CONSENSUS</p><h3>${escapeHtml(mostLikelyOutcome.label)}</h3><p>Moyenne des probabilités de trois variantes Poisson, non calibrées sur un historique de résultats.</p></div><strong>${formatPercent(mostLikelyOutcome.probability)}</strong></section>
    <section class="result-panel stats-strip"><div class="section-heading"><div><p class="eyebrow">ANALYSE STATISTIQUE</p><h3>Forces & forme récente</h3></div><span class="fine-print">Saison ${(output.configuration.seasonWeight * 100).toFixed(0)}% · forme récente ${(output.configuration.recentWeight * 100).toFixed(0)}%</span></div>
      ${[teamA, teamB].map((team) => `<div class="team-stat-line"><strong>${escapeHtml(team.name)}</strong><span>Saison GF/MP <b>${team.strength.season.goalsFor.toFixed(2)}</b></span><span>Saison GA/MP <b>${team.strength.season.goalsAgainst.toFixed(2)}</b></span><span>Forme GF/GA <b>${team.strength.recent.gf.toFixed(2)} / ${team.strength.recent.ga.toFixed(2)}</b></span><span>Attaque / défense <b>${team.strength.attack.toFixed(2)} / ${team.strength.defense.toFixed(2)}</b></span></div>`).join("")}</section>
    <div class="result-grid">${renderPeriodPanel("Mi-temps", output.halfTime, teamA.name, teamB.name, false)}${renderPeriodPanel("Fin du match", output.fullTime, teamA.name, teamB.name, true)}</div>
    <section class="result-panel model-comparison"><div class="section-heading"><div><p class="eyebrow">COMPARAISON</p><h3>Variantes du modèle</h3></div><span class="fine-print">Pondération initiale · sans calibration</span></div><div class="table-scroll"><table><thead><tr><th>Variante</th><th>${escapeHtml(teamA.name)}</th><th>Nul</th><th>${escapeHtml(teamB.name)}</th><th>Poids</th></tr></thead><tbody>${modelRows}</tbody></table></div></section>
    <section class="result-panel ratio-panel"><p class="eyebrow">PART DES BUTS AVANT LA PAUSE · LISSAGE k=${output.configuration.halftimeSmoothingGoals}</p><div class="ratio-values"><span>${escapeHtml(teamA.name)} marqués ${formatPercent(output.halfTime.ratios.teamAAttack * 100)} · encaissés ${formatPercent(output.halfTime.ratios.teamAConcede * 100)}</span><span>${escapeHtml(teamB.name)} marqués ${formatPercent(output.halfTime.ratios.teamBAttack * 100)} · encaissés ${formatPercent(output.halfTime.ratios.teamBConcede * 100)}</span></div></section>
    <article class="result-panel"><div class="section-heading"><div><p class="eyebrow">SCÉNARIOS COHÉRENTS</p><h3>Mi-temps / fin du match</h3></div><span class="history-confidence">Confiance MT : faible</span></div><div class="combination-table">${combinations}</div></article>
    <details class="odds-tools"><summary>Comparer des cotes manuelles <span>OPTIONNEL</span></summary><form id="odds-form" class="odds-form">
      <label>Cote 1<input name="odds_1" type="number" min="1.01" step="0.01" required placeholder="2.10"></label>
      <label>Cote X<input name="odds_x" type="number" min="1.01" step="0.01" required placeholder="3.40"></label>
      <label>Cote 2<input name="odds_2" type="number" min="1.01" step="0.01" required placeholder="3.60"></label>
      <button class="button button-quiet" type="submit">Comparer</button></form><div id="odds-output" aria-live="polite"></div>
      <p class="fine-print">EV et cotes justes sont des indicateurs statistiques, pas une garantie de gain. Les probabilités brutes et normalisées sont distinguées.</p></details>
    <div class="analysis-explanation"><strong>Calcul xG.</strong> ${output.assumptions.map(escapeHtml).join(" ")} Lambda FT = ${output.expectedGoals.fullTime.teamA.toFixed(2)}–${output.expectedGoals.fullTime.teamB.toFixed(2)} ; les buts de seconde période sont les incréments attendus après la pause.</div>
    <p class="fine-print">Une estimation statistique n’est jamais une garantie de résultat. Les marges affichées sont arrondies.</p>
  </div>`;
}

export function renderPredictionHistory(analyses) {
  const container = document.querySelector("#prediction-history");
  container.innerHTML = analyses.length
    ? analyses.map((analysis) => {
      const top = analysis.output?.fullTime?.exactScores?.[0];
      const [teamA, teamB] = analysis.output?.teams ?? [];
      return `<article class="history-item"><span><strong>${escapeHtml(teamA?.name ?? "Équipe A")} vs ${escapeHtml(teamB?.name ?? "Équipe B")}</strong><small>${escapeHtml(analysis.championshipName)} · ${formatDate(analysis.createdAt)} · Modèle ${escapeHtml(analysis.output.modelVersion)}</small></span>
        <strong class="history-score">${top ? `${top.goalsA}–${top.goalsB}` : "—"}</strong><span class="history-confidence">MT : confiance faible <button class="icon-action icon-action--danger" type="button" data-delete-analysis="${escapeHtml(analysis.id)}">Supprimer</button></span></article>`;
    }).join("")
    : `<div class="empty-state"><strong>Historique vide</strong>Les analyses apparaîtront ici après leur sauvegarde locale.</div>`;
}