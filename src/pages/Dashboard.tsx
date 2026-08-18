import { useState } from "react";
import { ActiveAlgos } from "../components/dashboard/ActiveAlgos";
import { AISignal } from "../components/dashboard/AISignal";
import { InstitutionalFlow } from "../components/dashboard/InstitutionalFlow";
import { MarketDNA } from "../components/dashboard/MarketDNA";
import { OptionChain } from "../components/dashboard/OptionChain";
import { Positions } from "../components/dashboard/Positions";
import { PriceChart } from "../components/dashboard/PriceChart";
import { RecentSignals } from "../components/dashboard/RecentSignals";
import { SentimentGauge } from "../components/dashboard/SentimentGauge";
import { TickerStrip } from "../components/dashboard/TickerStrip";
import { IndexIds } from "../components/dashboard/IndexIds";
import { FuturesTape } from "../components/dashboard/FuturesTape";
import { TradeModal } from "../components/dashboard/TradeModal";

export function Dashboard() {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <div className="space-y-3">
      <TickerStrip />
      <IndexIds />
      <FuturesTape />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <PriceChart />
        </div>
        <AISignal onReview={() => setReviewOpen(true)} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <MarketDNA />
        <SentimentGauge />
        <InstitutionalFlow />
        <OptionChain />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ActiveAlgos />
        <Positions />
        <RecentSignals />
      </div>
      <TradeModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}
