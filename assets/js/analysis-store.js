const STORAGE_KEY = "fc26-predictor.analyses.v1";
const FILE_FORMAT = "fc26-predictor-analyses";
const FILE_VERSION = 1;
let linkedFileHandle = null;

function emptyArchive() {
  return { app: FILE_FORMAT, version: FILE_VERSION, analyses: [] };
}

function validateArchive(value) {
  if (!value || value.app !== FILE_FORMAT || value.version !== FILE_VERSION || !Array.isArray(value.analyses)) {
    throw new TypeError("Ce fichier JSON n’est pas une archive FC26 Predictor reconnue.");
  }
  for (const analysis of value.analyses) {
    if (!analysis?.id || !analysis?.createdAt || !analysis?.output?.fullTime?.result
      || !Array.isArray(analysis.output?.teams) || analysis.output.teams.length !== 2) {
      throw new TypeError("L’archive contient une analyse incomplète ou invalide.");
    }
  }
  return value;
}

export function readAnalyses() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return validateArchive(JSON.parse(stored)).analyses;
  } catch (error) {
    throw new Error(`Impossible de lire la sauvegarde locale : ${error.message}`);
  }
}

export function serializeArchive(analyses = readAnalyses()) {
  return JSON.stringify({ ...emptyArchive(), analyses }, null, 2);
}

async function writeLinkedFile(analyses) {
  if (!linkedFileHandle) return false;
  const writable = await linkedFileHandle.createWritable();
  await writable.write(serializeArchive(analyses));
  await writable.close();
  return true;
}

export async function saveAnalysis(analysis) {
  const analyses = [analysis, ...readAnalyses().filter((item) => item.id !== analysis.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyArchive(), analyses }));
  try {
    return { analyses, fileUpdated: await writeLinkedFile(analyses) };
  } catch (error) {
    return { analyses, fileUpdated: false, fileError: error.message };
  }
}

export async function deleteAnalysis(id) {
  const analyses = readAnalyses().filter((analysis) => analysis.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyArchive(), analyses }));
  try {
    return { analyses, fileUpdated: await writeLinkedFile(analyses) };
  } catch (error) {
    return { analyses, fileUpdated: false, fileError: error.message };
  }
}

export function downloadArchive(analyses = readAnalyses()) {
  const blob = new Blob([serializeArchive(analyses)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "fc26-predictor-analyses.json";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function linkJSONFile() {
  if (typeof window.showSaveFilePicker !== "function") return false;
  linkedFileHandle = await window.showSaveFilePicker({
    suggestedName: "fc26-predictor-analyses.json",
    types: [{ description: "Archive JSON", accept: { "application/json": [".json"] } }],
  });
  await writeLinkedFile(readAnalyses());
  return true;
}

export async function importArchive(file) {
  const imported = validateArchive(JSON.parse(await file.text())).analyses;
  const current = readAnalyses();
  const merged = new Map(current.map((analysis) => [analysis.id, analysis]));
  for (const analysis of imported) merged.set(analysis.id, analysis);
  const analyses = [...merged.values()].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyArchive(), analyses }));
  try {
    return { analyses, importedCount: imported.length, fileUpdated: await writeLinkedFile(analyses) };
  } catch (error) {
    return { analyses, importedCount: imported.length, fileUpdated: false, fileError: error.message };
  }
}
