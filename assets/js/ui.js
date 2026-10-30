export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function notify(message, type = "info") {
  const region = document.querySelector("#notifications");
  if (!region) return;
  const notification = document.createElement("div");
  notification.className = `notification notification--${type}`;
  notification.setAttribute("role", type === "error" ? "alert" : "status");
  notification.textContent = message;
  region.append(notification);
  window.setTimeout(() => notification.remove(), 5000);
}

export function setBusy(button, busy, label = "Enregistrement…") {
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalLabel ?? button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

export function formatPercent(value) {
  return `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

export function formatDate(value) {
  if (!value) return "Date non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export function confirmDelete(message) {
  return window.confirm(message);
}