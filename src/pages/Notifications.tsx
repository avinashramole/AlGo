export function Notifications() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold">Notifications</h1>
      {[
        "VWAP Depth generated BUY on NIFTY 24500 CE",
        "Momentum Rider filled FINNIFTY 24900 CE",
        "ORB Breakout paused after 2 consecutive losses",
        "FII net inflow crossed +1,500 Cr",
      ].map((item) => (
        <div key={item} className="card px-4 py-3 text-sm">
          {item}
        </div>
      ))}
    </div>
  );
}
