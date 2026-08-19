export const PREVIEW_DESK_MESSAGE =
  "This is a Cursor preview. Dhan BUY/SELL must run on your PC: keep npm start open, then Chrome http://localhost:5173. Do not add another IP.";

export function isRemotePreviewHost(host = typeof window === "undefined" ? "" : window.location.hostname) {
  return /cvm\.dev|cursor\.com|cursor\.sh|ngrok|trycloudflare|githubpreview|github\.dev|cloudfront|amazonaws/i.test(
    String(host || ""),
  );
}

export function PreviewDeskBanner() {
  if (typeof window === "undefined" || !isRemotePreviewHost()) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[80] bg-rose-600 px-3 py-2 text-center text-xs font-semibold text-white">
      {PREVIEW_DESK_MESSAGE}
    </div>
  );
}
