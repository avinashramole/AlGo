export const PREVIEW_DESK_MESSAGE =
  "Chrome is fine, but this address is a Cursor preview (agent.cvm.dev), not your PC. In the Chrome address bar type exactly http://localhost:5173 and press Enter. Keep npm start running on your computer. Do not add another IP.";

export function isRemotePreviewHost(host = typeof window === "undefined" ? "" : window.location.hostname) {
  return /cvm\.dev|cursor\.com|cursor\.sh|ngrok|trycloudflare|githubpreview|github\.dev|cloudfront|amazonaws/i.test(
    String(host || ""),
  );
}

export function PreviewDeskBanner() {
  if (typeof window === "undefined" || !isRemotePreviewHost()) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white p-6 text-slate-900">
      <div className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-xl">
        <div className="text-lg font-extrabold text-rose-700">Wrong website address</div>
        <p className="mt-3 text-sm leading-6">
          Chrome is OK. The long <b>agent.cvm.dev</b> link is Cursor’s preview, so Dhan sees a different IP and BUY/SELL
          shows Invalid IP.
        </p>
        <ol className="mt-4 list-decimal space-y-2 px-6 text-left text-sm font-semibold">
          <li>Keep the black npm start window open on your PC</li>
          <li>Click the Chrome address bar (the top box with the website name)</li>
          <li>
            Delete everything and type <code className="rounded bg-white px-1">http://localhost:5173</code>
          </li>
          <li>Press Enter, then BUY/SELL</li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">Do not add another IP. Static IP 1 150.129.129.108 is already saved.</p>
      </div>
    </div>
  );
}
