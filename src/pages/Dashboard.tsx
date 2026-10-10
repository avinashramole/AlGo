import { useState } from "react";
import { AISignal } from "../components/dashboard/AISignal";
import { InstitutionalFlow } from "../components/dashboard/InstitutionalFlow";
import { MarketDNA } from "../components/dashboard/MarketDNA";
import { PriceChart } from "../components/dashboard/PriceChart";
import { RecentSignals } from "../components/dashboard/RecentSignals";
import { SentimentGauge } from "../components/dashboard/SentimentGauge";
import { TickerStrip } from "../components/dashboard/TickerStrip";
import { TradeModal } from "../components/dashboard/TradeModal";
import { HomeOverview } from "../components/home/HomeOverview";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";
import { chainIdFromIndex } from "../lib/markets";
import { isRetiredDeskStrategy, sortDeskAlgos } from "../lib/strategies";

export function Dashboard() {
  const [reviewOpen, setReviewOpen] = useState(false);
  const { user } = useAuth();
  const { data } = useMarket();
  const nifty = (data.indices || []).find((row) => chainIdFromIndex(row.symbol) === "NIFTY") || data.indices?.[0];
  const broker = (data.brokers || []).find((item) => item.id === data.activeBrokerId) || (data.brokers || [])[0];
  const capital = Number(broker?.funds || 0);
  const available = Math.max(0, capital - Number(broker?.marginUsed || 0));
  const pnl = Number(data.report?.netPnl || data.report?.realizedPnl || 0);
  const strategies = sortDeskAlgos((data.algos || []).filter((algo) => !isRetiredDeskStrategy(algo)))
    .slice(0, 5)
    .map((algo) => ({
      id: algo.id,
      name: algo.name,
      detail: `${algo.tag || algo.kind || "Strategy"} · ${algo.runMode || "live"}`,
      pnl: Number(algo.pnl || 0),
      status: algo.status || (algo.enabled ? "LIVE" : "STOPPED"),
      running: Boolean(algo.enabled),
      to: "/algo",
    }));

  return (
    <div className="space-y-3" data-home-layout="tapes">
      <HomeOverview
        name={user?.name}
        quote={nifty ? { symbol: nifty.symbol || "NIFTY", price: nifty.price, change: nifty.change, changePct: nifty.changePct } : null}
        capital={capital}
        available={available}
        pnl={pnl}
        algosTo="/algo"
        ordersTo="/orders"
        positionsTo="/positions"
        reportsTo="/reports"
        strategies={strategies}
      />
      <TickerStrip />
      <PriceChart />
      <AISignal onReview={() => setReviewOpen(true)} />
      <MarketDNA />
      <SentimentGauge />
      <InstitutionalFlow />
      <RecentSignals />
      <TradeModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}
