let toastTimer = 0;

export function showDeskToast(message: string) {
  if (typeof document === "undefined") return;
  const text = String(message || "").trim();
  if (!text) return;
  document.getElementById("t2s-desk-toast")?.remove();
  const el = document.createElement("div");
  el.id = "t2s-desk-toast";
  el.className = "t2s-desk-toast";
  el.setAttribute("role", "status");
  el.setAttribute("data-desk-toast", "true");
  el.textContent = text;
  document.body.appendChild(el);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2800);
}
