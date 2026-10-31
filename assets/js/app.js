import { MODEL_CONFIG } from "./engine/config.js?v=ensemble-3";
import { predictMatch } from "./engine/match-prediction.js?v=ensemble-3";
import { analyzeOdds, normalizeImpliedProbabilities } from "./engine/odds-analysis.js?v=ensemble-3";
import { readAnalyses, saveAnalysis, deleteAnalysis, downloadArchive, linkJSONFile, importArchive } from "./analysis-store.js";
import { renderDashboard } from "./modules/dashboard.js?v=learning-5";
import { renderPredictionHistory, renderPredictionResult } from "./modules/predictions.js?v=learning-5";
import { notify, setBusy, formatDate } from "./ui.js";

const state = { analyses: [] };
const viewTitles = { analysis: "Analyser un match", overview: "Dashboard", history: "Historique" };

function showView(name) {
  const target = state.analyses.length ? name : "analysis";
  document.querySelectorAll("[data-view]").forEach((view) => {
    const visible = view.dataset.view === target;
    view.classList.toggle("is-visible", visible);
    view.hidden = !visible;
  });
  document.querySelectorAll(".nav-link[data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === target;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#current-view-title").textContent = viewTitles[target];
}

function createRecentInputs(side) {
  const container = document.querySelector(`#team-${side === "a" ? "a" : "b"}-recent-fields`);
  const periods = ["Dernier match", "Deuxième match", "Troisième match"];
  container.innerHTML = `<p class="recent-section-title">FORME RÉCENTE <span>50% / 30% / 20%</span></p>${periods.map((title, index) => {
    const matchNumber = index + 1;
    return `<fieldset class="recent-match-fields"><legend><span>${String(matchNumber).padStart(2, "0")}</span>${title}</legend><div class="recent-context-grid">
      <label>Adversaire (facultatif)<input name="team_${side}_recent_${matchNumber}_opponent" maxlength="100" placeholder="Nom de l’adversaire"></label>
      <label>Date (facultative)<input name="team_${side}_recent_${matchNumber}_date" type="date"></label>
      <label>Lieu<select name="team_${side}_recent_${matchNumber}_venue"><option value="unknown">Non précisé</option><option value="home">Domicile</option><option value="away">Extérieur</option></select></label>
    </div><div class="recent-score-grid">
      <label><span data-team-score-label="${side}-ht">Équipe ${side.toUpperCase()} · MT</span><input name="team_${side}_recent_${matchNumber}_ht_gf" type="number" min="0" step="1" inputmode="numeric" required></label>
      <label><span>Adversaire · MT</span><input name="team_${side}_recent_${matchNumber}_ht_ga" type="number" min="0" step="1" inputmode="numeric" required></label>
      <label><span data-team-score-label="${side}-ft">Équipe ${side.toUpperCase()} · FT</span><input name="team_${side}_recent_${matchNumber}_gf" type="number" min="0" step="1" inputmode="numeric" required></label>
      <label><span>Adversaire · FT</span><input name="team_${side}_recent_${matchNumber}_ga" type="number" min="0" step="1" inputmode="numeric" required></label>
    </div></fieldset>`;
  }).join("")}`;
}

function updateTeamScoreLabels(side, teamName = "") {
  const displayName = teamName.trim() || `Équipe ${side.toUpperCase()}`;
  document.querySelector(`[data-team-score-label="${side}-ht"]`).textContent = `${displayName} · MT`;
  document.querySelector(`[data-team-score-label="${side}-ft"]`).textContent = `${displayName} · FT`;
}

function numberValue(form, field) {
  const value = Number(form.elements.namedItem(field).value);
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${field} doit être un entier positif ou nul.`);
  return value;
}

function readTeam(form, side) {
  const name = form.elements.namedItem(`team_${side}_name`).value.trim();
  const mp = numberValue(form, `team_${side}_mp`);
  const gf = numberValue(form, `team_${side}_gf`);
  const ga = numberValue(form, `team_${side}_ga`);
  if (!name || mp <= 0) throw new RangeError(`Renseigne le nom et un nombre de matchs supérieur à zéro pour l’équipe ${side.toUpperCase()}.`);
  const recentMatches = [1, 2, 3].map((matchNumber) => {
    const prefix = `team_${side}_recent_${matchNumber}`;
    const match = {
      htGf: numberValue(form, `${prefix}_ht_gf`),
      htGa: numberValue(form, `${prefix}_ht_ga`),
      gf: numberValue(form, `${prefix}_gf`),
      ga: numberValue(form, `${prefix}_ga`),
      opponent: form.elements.namedItem(`${prefix}_opponent`).value.trim(),
      date: form.elements.namedItem(`${prefix}_date`).value || null,
      venue: form.elements.namedItem(`${prefix}_venue`).value,
    };
    if (match.htGf > match.gf || match.htGa > match.ga) {
      throw new RangeError(`${name}, ${matchNumber === 1 ? "dernier match" : `${matchNumber}e match`} : un score MT ne peut pas dépasser son score final.`);
    }
    return match;
  });
  if (mp < recentMatches.length) throw new RangeError(`${name} : MP doit être au moins égal aux trois matchs récents saisis.`);
  return { id: side, name, championshipId: "manual-league", standing: { mp, gf, ga }, recentMatches };
}

function refreshViews() {
  state.analyses = readAnalyses();
  const hasAnalyses = state.analyses.length > 0;
  document.querySelector("#dashboard-nav").hidden = !hasAnalyses;
  document.querySelector("#history-nav").hidden = !hasAnalyses;
  const count = state.analyses.length;
  document.querySelector("#stored-count").textContent = `${count} analyse${count === 1 ? "" : "s"}`;
  renderDashboard(state.analyses);
  renderPredictionHistory(state.analyses);
  if (!hasAnalyses && ["overview", "history"].includes(document.querySelector(".view.is-visible")?.dataset.view)) {
    showView("analysis");
  }
}

async function analyze(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector("button[type=submit]");
  setBusy(button, true, "Calcul en cours…");
  try {
    const championshipName = form.elements.namedItem("league_name").value.trim() || "Compétition non précisée";
    const teamA = readTeam(form, "a");
    const teamB = readTeam(form, "b");
    if (teamA.name.toLocaleLowerCase() === teamB.name.toLocaleLowerCase()) throw new RangeError("Les deux équipes doivent être différentes.");
    const output = predictMatch({ teamA, teamB });
    const input = {
      championshipName,
      teamA,
      teamB,
      modelConfig: MODEL_CONFIG,
    };
    const analysis = {
      id: crypto.randomUUID(),
      createdAt: output.analyzedAt,
      championshipName,
      input,
      output,
    };
    let saved = true;
    let saveResult;
    try {
      saveResult = await saveAnalysis(analysis);
      state.analyses = saveResult.analyses;
    } catch (error) {
      saved = false;
      try {
        state.analyses = readAnalyses();
      } catch {
        state.analyses = [];
      }
      notify(`Analyse calculée mais non sauvegardée : ${error.message}`, "error");
    }
    const hasAnalyses = state.analyses.length > 0;
    document.querySelector("#dashboard-nav").hidden = !hasAnalyses;
    document.querySelector("#history-nav").hidden = !hasAnalyses;
    document.querySelector("#stored-count").textContent = `${state.analyses.length} analyse${state.analyses.length === 1 ? "" : "s"}`;
    renderDashboard(state.analyses);
    renderPredictionHistory(state.analyses);
    renderPredictionResult(output, [output.teams[0], output.teams[1]], saved, championshipName);
    bindOddsForm(output);
    document.querySelector("#analysis-result").scrollIntoView({ behavior: "smooth", block: "start" });
    if (saved) {
      notify(saveResult.fileUpdated ? "Analyse enregistrée dans le navigateur et le fichier JSON lié." : "Analyse enregistrée sur cet appareil.", "success");
      if (saveResult.fileError) notify(`La copie dans le fichier JSON lié a échoué : ${saveResult.fileError}. Exporte une archive.`, "error");
    }
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}

function bindOddsForm(output) {
  const form = document.querySelector("#odds-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const odds = ["odds_1", "odds_x", "odds_2"].map((name) => Number(form.elements.namedItem(name).value));
      const normalized = normalizeImpliedProbabilities(odds);
      const probabilities = [output.fullTime.result.teamA, output.fullTime.result.draw, output.fullTime.result.teamB]
        .map((value) => value / 100);
      const labels = ["1", "X", "2"];
      const rows = odds.map((decimal, index) => {
        const analysis = analyzeOdds(probabilities[index], decimal);
        return `<tr><td>${labels[index]}</td><td>${decimal.toFixed(2)}</td><td>${(normalized.raw[index] * 100).toFixed(1)}%</td><td>${(normalized.normalized[index] * 100).toFixed(1)}%</td><td>${analysis.fairOdds?.toFixed(2) ?? "—"}</td><td>${(analysis.expectedValue * 100).toFixed(1)}%</td></tr>`;
      }).join("");
      document.querySelector("#odds-output").innerHTML = `<div class="table-scroll"><table><thead><tr><th>Issue</th><th>Cote</th><th>Implicite brut</th><th>Normalisé</th><th>Cote juste</th><th>EV</th></tr></thead><tbody>${rows}</tbody></table></div><p class="fine-print">Surcote estimée : ${(normalized.overround * 100).toFixed(1)}%</p>`;
    } catch (error) {
      notify(error.message, "error");
    }
  });
}

async function handleImport(event) {
  const input = event.currentTarget;
  const [file] = input.files;
  if (!file) return;
  try {
    const imported = await importArchive(file);
    state.analyses = imported.analyses;
    refreshViews();
    showView("overview");
    notify(`${imported.importedCount} analyse(s) importée(s) et fusionnée(s).`, "success");
    if (imported.fileError) notify(`Le fichier lié n’a pas été mis à jour : ${imported.fileError}`, "error");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    input.value = "";
  }
}

async function handleFileLink() {
  try {
    if (await linkJSONFile()) notify("Fichier JSON lié. Les prochaines analyses le mettront à jour.", "success");
    else {
      downloadArchive(state.analyses);
      notify("Le navigateur ne permet pas de lier un fichier directement. Archive JSON téléchargée.", "info");
    }
  } catch (error) {
    if (error.name !== "AbortError") notify(`Impossible de créer le fichier JSON : ${error.message}`, "error");
  }
}

function bindEvents() {
  const form = document.querySelector("#prediction-form");
  form.addEventListener("submit", analyze);
  form.addEventListener("input", (event) => {
    const nameField = event.target.name.match(/^team_([ab])_name$/);
    if (nameField) updateTeamScoreLabels(nameField[1], event.target.value);
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });
  document.querySelector("#export-json-button").addEventListener("click", () => downloadArchive(state.analyses));
  document.querySelector("#history-export-button").addEventListener("click", () => downloadArchive(state.analyses));
  document.querySelector("#import-json-button").addEventListener("click", () => document.querySelector("#import-json-input").click());
  document.querySelector("#import-json-input").addEventListener("change", handleImport);
  document.querySelector("#link-json-button").addEventListener("click", handleFileLink);
  document.querySelector("#prediction-history").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-analysis]");
    if (!button || !window.confirm("Supprimer cette analyse de cet appareil ?")) return;
    try {
      const deleted = await deleteAnalysis(button.dataset.deleteAnalysis);
      refreshViews();
      notify("Analyse supprimée de cet appareil.", "success");
      if (deleted.fileError) notify(`Le fichier lié n’a pas été mis à jour : ${deleted.fileError}`, "error");
    } catch (error) {
      notify(error.message, "error");
    }
  });
  document.querySelector("#prediction-history").addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-save-result]");
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Enregistrement…");
    try {
      const readScore = (name) => {
        const score = Number(form.elements.namedItem(name).value);
        if (!Number.isInteger(score) || score < 0) throw new RangeError("Les scores réels doivent être des entiers positifs ou nuls.");
        return score;
      };
      const ht = { teamA: readScore("ht_team_a"), teamB: readScore("ht_team_b") };
      const ft = { teamA: readScore("ft_team_a"), teamB: readScore("ft_team_b") };
      if (ht.teamA > ft.teamA || ht.teamB > ft.teamB) {
        throw new RangeError("Un score à la mi-temps ne peut pas dépasser le score final correspondant.");
      }
      const analysis = state.analyses.find((item) => item.id === form.dataset.saveResult);
      if (!analysis) throw new Error("Cette analyse n’existe plus dans l’archive locale. Actualise l’historique.");
      const saved = await saveAnalysis({
        ...analysis,
        actualResult: { ht, ft, recordedAt: new Date().toISOString() },
      });
      state.analyses = saved.analyses;
      refreshViews();
      notify("Score réel enregistré. Les métriques et le backtest ont été actualisés.", "success");
      if (saved.fileError) notify(`La copie dans le fichier JSON lié a échoué : ${saved.fileError}. Exporte une archive.`, "error");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(button, false);
    }
  });
  document.querySelector("#today-date").textContent = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date());
  document.querySelector("#prediction-form").addEventListener("reset", () => window.setTimeout(() => {
    document.querySelector("#analysis-result").replaceChildren();
    updateTeamScoreLabels("a");
    updateTeamScoreLabels("b");
  }, 0));
}

function start() {
  createRecentInputs("a");
  createRecentInputs("b");
  bindEvents();
  try {
    refreshViews();
    showView(state.analyses.length ? "overview" : "analysis");
  } catch (error) {
    notify(error.message, "error");
  }
}

start();
