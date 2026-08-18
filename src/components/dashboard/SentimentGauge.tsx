import { Gauge } from "../charts/Gauge";

export function SentimentGauge() {
  return (
    <section className="card p-4">
      <div className="mb-1 text-sm font-bold">Market Sentiment</div>
      <Gauge score={91} />
      <div className="mt-1 text-center text-sm font-extrabold tracking-wide text-up">BULLISH</div>
      <p className="mt-1 text-center text-[11px] text-slate-400">Strong buy-side pressure with rising OI</p>
    </section>
  );
}
