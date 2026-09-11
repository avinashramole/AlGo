import { useMarket } from "../../context/MarketContext";
import { Gauge } from "../charts/Gauge";

export function SentimentGauge() {
  const { data } = useMarket();
  const bullish = data.sentiment >= 55;
  return (
    <section className="card p-4">
      <div className="mb-1 text-sm font-bold">Market Sentiment</div>
      <Gauge score={data.sentiment} />
      <div className={`mt-1 text-center text-sm font-extrabold tracking-wide ${bullish ? "text-up" : "text-down"}`}>
        {bullish ? "BULLISH" : "BEARISH"}
      </div>
      <p className="mt-1 text-center text-[11px] text-slate-400">
        {data.dhanFeed?.live ? "From live index change and option buy pressure" : "From the current desk tape"}
      </p>
    </section>
  );
}
