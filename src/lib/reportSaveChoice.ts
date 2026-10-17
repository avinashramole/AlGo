export type ReportSaveMode = "download" | "share";

export function askReportSaveAction(kind = "PDF"): Promise<ReportSaveMode | "cancel"> {
  if (typeof document === "undefined") return Promise.resolve("download");
  document.getElementById("t2s-report-save")?.remove();
  return new Promise((resolve) => {
    const finish = (choice: ReportSaveMode | "cancel") => {
      root.remove();
      resolve(choice);
    };
    const root = document.createElement("div");
    root.id = "t2s-report-save";
    root.className = "t2s-report-save-scrim";
    root.setAttribute("data-report-save", "choice");
    root.addEventListener("click", (event) => {
      if (event.target === root) finish("cancel");
    });
    const card = document.createElement("div");
    card.className = "t2s-report-save-card";
    const title = document.createElement("div");
    title.className = "t2s-report-save-title";
    title.textContent = kind === "Excel" ? "Excel" : "PDF";
    const download = document.createElement("button");
    download.type = "button";
    download.setAttribute("data-report-save-download", "true");
    download.textContent = "Download";
    download.addEventListener("click", () => finish("download"));
    const share = document.createElement("button");
    share.type = "button";
    share.setAttribute("data-report-save-share", "true");
    share.textContent = "Share";
    share.addEventListener("click", () => finish("share"));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.setAttribute("data-report-save-cancel", "true");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => finish("cancel"));
    card.append(title, download, share, cancel);
    root.append(card);
    document.body.append(root);
  });
}
