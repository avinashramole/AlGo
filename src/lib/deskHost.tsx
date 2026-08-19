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
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 200,
        background: "#be123c",
        color: "#fff",
        padding: "16px 20px",
        fontFamily: "sans-serif",
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800 }}>Wrong website address — this is why you see Invalid IP</div>
      <p style={{ margin: "8px 0 0", fontSize: 14 }}>
        Chrome is OK. The long agent.cvm.dev link is Cursor’s preview. Dhan then sees a different IP. Do not add another
        IP.
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 700 }}>
        Click the Chrome address bar, delete everything, type http://localhost:5173 and press Enter. Keep the npm start
        window open.
      </p>
    </div>
  );
}
